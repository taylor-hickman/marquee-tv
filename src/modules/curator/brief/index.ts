// Brief extraction (architecture 6.2 step 1, 6.3 refine row): one small-model
// call, then code that holds what the model may not decide. Seeds come from the
// input, ids are checked against the catalog, and a typed duration beats the
// control only through the length the model read from the text (PRD 18.1).
import type { ArtistId, Brief, BriefInput, RefineBrief } from "@/contracts";
import * as llm from "../llm";
import type { CallOptions, LlmAdapter, LlmResult } from "../llm";
import {
  type BriefCatalog,
  type ListRow,
  type ModelBrief,
  type ModelRefine,
  generateSystem,
  generateUser,
  modelBrief,
  modelRefine,
  refineSystem,
  refineUser,
} from "./prompt";

export type { BriefCatalog, ListRow } from "./prompt";
export { CHIP_TEXT } from "./prompt";

export type BriefContext = BriefCatalog & {
  // An exact name or alias match in the catalog; null when there is none.
  artistIdFor: (name: string) => Promise<ArtistId | null>;
};

export type BriefOptions = CallOptions & {
  llm?: Pick<LlmAdapter, "extractBrief">;
};

const defaultLlm = { extractBrief: llm.extractBrief };

const MAX_MIN = 6 * 60;

export async function extractBrief(
  input: BriefInput,
  context: BriefContext,
  { llm = defaultLlm, ...options }: BriefOptions = {},
): Promise<LlmResult<Brief>> {
  const result = await llm.extractBrief(
    { system: generateSystem(context), user: generateUser(input) },
    modelBrief,
    options,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    output: await toBrief(result.output, input, context),
    calls: result.calls,
  };
}

export type RefineRequest = {
  instruction: string;
  brief: Brief;
  list: ListRow[];
};

export async function extractRefineBrief(
  request: RefineRequest,
  context: BriefContext,
  { llm = defaultLlm, ...options }: BriefOptions = {},
): Promise<LlmResult<RefineBrief>> {
  const result = await llm.extractBrief(
    {
      system: refineSystem(context),
      user: refineUser(request.instruction, request.brief, request.list),
    },
    modelRefine,
    options,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    output: await toRefine(result.output, request, context),
    calls: result.calls,
  };
}

async function toBrief(
  model: ModelBrief,
  input: BriefInput,
  context: BriefContext,
): Promise<Brief> {
  const durationS = typedDuration(model.stated_length_min) ?? input.durationS;
  const narrowed = await constraints(model, context, {
    series_include: [],
    series_exclude: [],
    exclusions: { artist_ids: [], publisher_ids: [] },
  });
  return {
    curve: fitCurve(model.curve, durationS / 60),
    genres: terms(model.genres),
    scenes: terms(model.scenes),
    seeds: input.seeds.flatMap((s) =>
      "artistId" in s
        ? [{ artist_id: s.artistId, must_include: s.mustInclude }]
        : [],
    ),
    influences: model.influences
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        genres: terms(i.genres),
        scenes: terms(i.scenes),
        energy: i.energy,
      })),
    ...narrowed,
    novelty: model.novelty,
    surprise: model.surprise || input.mood === "surprise_me",
    duration_s: durationS,
  };
}

async function toRefine(
  model: ModelRefine,
  { brief, list }: RefineRequest,
  context: BriefContext,
): Promise<RefineBrief> {
  const delta: RefineBrief["delta"] = {};
  const durationS = typedDuration(model.stated_length_min);
  if (durationS) delta.duration_s = durationS;

  const curve =
    model.curve && clipCurve(model.curve, (durationS ?? brief.duration_s) / 60);
  if (curve?.length) delta.curve = curve;
  // An empty list means unchanged, as null does: never a wipe of the current terms.
  if (model.genres?.length) delta.genres = terms(model.genres);
  if (model.scenes?.length) delta.scenes = terms(model.scenes);
  if (model.novelty) delta.novelty = model.novelty;

  const narrowed = await constraints(model, context, brief);
  for (const key of ["series_include", "series_exclude"] as const) {
    if (!same(narrowed[key], brief[key])) delta[key] = narrowed[key];
  }
  const { artist_ids, publisher_ids } = narrowed.exclusions;
  if (
    !same(artist_ids, brief.exclusions.artist_ids) ||
    !same(publisher_ids, brief.exclusions.publisher_ids)
  ) {
    delta.exclusions = narrowed.exclusions;
  }

  return { delta, scope: fitScope(model.scope, delta.curve, list) };
}

// The length the model read from the text, as whole minutes within the control's range.
function typedDuration(minutes: number | null): number | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const whole = Math.round(minutes);
  return whole >= 1 && whole <= MAX_MIN ? whole * 60 : null;
}

// The model's segments, sorted, joined end to end and stretched so they run
// from 0 to the set's length. Models are loose with arithmetic; the shape is what counts.
export function fitCurve(
  segments: ModelBrief["curve"],
  lengthMin: number,
): Brief["curve"] {
  const sorted = segments
    .filter((s) => s.to_min > s.from_min)
    .sort((a, b) => a.from_min - b.from_min);
  if (sorted.length === 0) {
    return [
      { from_min: 0, to_min: lengthMin, energy: segments[0]?.energy ?? 3 },
    ];
  }
  const start = sorted[0].from_min;
  const span = sorted.at(-1)!.to_min - start;
  const at = (min: number) => Math.round(((min - start) / span) * lengthMin);
  const curve: Brief["curve"] = [];
  for (const [i, s] of sorted.entries()) {
    const from_min = curve.at(-1)?.to_min ?? 0;
    const to_min = i === sorted.length - 1 ? lengthMin : at(s.to_min);
    if (to_min > from_min) curve.push({ from_min, to_min, energy: s.energy });
  }
  return curve;
}

// A refine's segments cover only the stretch that changes: clip them to the set.
function clipCurve(
  segments: ModelBrief["curve"],
  lengthMin: number,
): Brief["curve"] {
  return segments
    .map((s) => ({
      from_min: Math.max(0, Math.round(s.from_min)),
      to_min: Math.min(lengthMin, Math.round(s.to_min)),
      energy: s.energy,
    }))
    .filter((s) => s.to_min > s.from_min)
    .sort((a, b) => a.from_min - b.from_min);
}

// The model's scope, clamped and ordered, and widened to every item that starts
// inside the delta's curve: an item whose energy target changes is in scope.
// Models miscount minutes into indexes; start minutes settle it.
function fitScope(
  scope: ModelRefine["scope"],
  curve: Brief["curve"] | undefined,
  list: ListRow[],
): RefineBrief["scope"] {
  if (!scope || list.length === 0) return null;
  const clamp = (i: number) => Math.min(Math.max(i, 0), list.length - 1);
  const touched = list
    .filter(
      (r) =>
        r.start_min !== null &&
        curve?.some(
          (s) => s.from_min <= r.start_min! && r.start_min! < s.to_min,
        ),
    )
    .map((r) => r.index);
  const ends = [clamp(scope.from_index), clamp(scope.to_index), ...touched];
  const from_index = Math.min(...ends);
  const to_index = Math.max(...ends);
  return from_index === 0 && to_index === list.length - 1
    ? null
    : { from_index, to_index };
}

type Narrowing = Pick<
  ModelBrief,
  | "sources_include"
  | "sources_exclude"
  | "format_include"
  | "format_exclude"
  | "exclude_artists"
>;
type Constraints = Pick<
  Brief,
  "series_include" | "series_exclude" | "exclusions"
>;

// The model's sources, formats and excluded artists against the catalog, on top
// of `current`. A source and a format together keep the series that fit both.
// Exclusions only grow, and nothing excluded stays included (CLAUDE.md rule 2).
async function constraints(
  model: Narrowing,
  context: BriefContext,
  current: Constraints,
): Promise<Constraints> {
  const publisherOf = new Map(
    context.series.map((s) => [s.id, s.publisher_id]),
  );
  const known = (ids: number[]) => ids.filter((id) => publisherOf.has(id));

  const asked = sources(model.sources_include, context);
  const named = unique([
    ...asked.series,
    ...context.series
      .filter((s) => asked.publishers.includes(s.publisher_id))
      .map((s) => s.id),
  ]);
  const format = known(model.format_include);
  const both = named.filter((id) => format.includes(id));
  const include =
    [both, named, format].find((ids) => ids.length) ?? current.series_include;

  const ruledOut = sources(model.sources_exclude, context);
  const series_exclude = unique([
    ...current.series_exclude,
    ...known(model.format_exclude),
    ...ruledOut.series,
  ]);
  const publisher_ids = unique([
    ...current.exclusions.publisher_ids,
    ...ruledOut.publishers,
  ]);
  const artists = await Promise.all(
    terms(model.exclude_artists, false).map((name) =>
      context.artistIdFor(name),
    ),
  );
  return {
    series_include: include.filter(
      (id) =>
        !series_exclude.includes(id) &&
        !publisher_ids.includes(publisherOf.get(id)!),
    ),
    series_exclude,
    exclusions: {
      artist_ids: unique([
        ...current.exclusions.artist_ids,
        ...artists.filter((id): id is ArtistId => id !== null),
      ]),
      publisher_ids,
    },
  };
}

// The series a source name fits, where either name contains the other ("Tiny
// Desk", "Live on KEXP sessions"). A name that fits no series fits the
// publishers whose name contains it ("NPR"); a longer name never widens to its
// publisher, so "Live on KEXP" is one series, not KEXP. A source the catalog
// doesn't have fits nothing, so it can't become an id.
function sources(names: string[], catalog: BriefCatalog) {
  const publishers: number[] = [];
  const series: number[] = [];
  for (const key of terms(names)) {
    const fits = catalog.series.filter((s) => {
      const name = s.name.toLowerCase();
      return name.includes(key) || key.includes(name);
    });
    if (fits.length > 0) series.push(...fits.map((s) => s.id));
    else
      publishers.push(
        ...catalog.publishers
          .filter((p) => p.name.toLowerCase().includes(key))
          .map((p) => p.id),
      );
  }
  return { publishers: unique(publishers), series: unique(series) };
}

function same(a: number[], b: number[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function terms(values: string[], lower = true): string[] {
  return unique(
    values
      .map((v) => (lower ? v.trim().toLowerCase() : v.trim()))
      .filter(Boolean),
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
