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

  const lengthMin = (durationS ?? brief.duration_s) / 60;
  const changed = model.curve ? clipCurve(model.curve, lengthMin) : [];
  if (durationS && durationS !== brief.duration_s) {
    // A new length stretches the current curve to it, so the delta carries the whole curve.
    delta.curve = overlayCurve(fitCurve(brief.curve, lengthMin), changed);
  } else if (changed.length) {
    delta.curve = changed;
  }
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

  return { delta, scope: fitScope(model.scope, changed, list) };
}

// The length the model read from the text, as whole minutes within the control's range.
function typedDuration(minutes: number | null): number | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const whole = Math.round(minutes);
  return whole >= 1 && whole <= MAX_MIN ? whole * 60 : null;
}

// The model's segments as one curve from 0 to the set's length, stretched from
// their own start and end. Where segments overlap, the one that starts later wins,
// so a peak nested in a longer segment survives; a gap keeps the energy before it.
// Models are loose with arithmetic; the shape is what counts.
export function fitCurve(
  segments: ModelBrief["curve"],
  lengthMin: number,
): Brief["curve"] {
  const valid = segments
    .filter((s) => s.to_min > s.from_min)
    .sort((a, b) => a.from_min - b.from_min);
  if (valid.length === 0) {
    return [
      { from_min: 0, to_min: lengthMin, energy: segments[0]?.energy ?? 3 },
    ];
  }
  const start = valid[0].from_min;
  const end = Math.max(...valid.map((s) => s.to_min));
  const points = unique(valid.flatMap((s) => [s.from_min, s.to_min])).sort(
    (a, b) => a - b,
  );
  const curve: Brief["curve"] = [];
  for (const [i, a] of points.slice(0, -1).entries()) {
    const b = points[i + 1];
    const energy =
      valid.findLast((s) => s.from_min <= a && b <= s.to_min)?.energy ??
      curve.at(-1)?.energy ??
      valid[0].energy;
    const from_min = curve.at(-1)?.to_min ?? 0;
    const to_min =
      b === end
        ? lengthMin
        : Math.min(
            lengthMin,
            Math.round(((b - start) / (end - start)) * lengthMin),
          );
    if (to_min <= from_min) continue;
    if (curve.at(-1)?.energy === energy) curve.at(-1)!.to_min = to_min;
    else curve.push({ from_min, to_min, energy });
  }
  return curve;
}

// `top` laid over `base`: top's segments replace base over their span. This is
// how a refine's curve delta merges into the current curve.
export function overlayCurve(
  base: Brief["curve"],
  top: Brief["curve"],
): Brief["curve"] {
  const kept = base.flatMap((s) =>
    top.reduce<Brief["curve"]>(
      (pieces, t) =>
        pieces.flatMap((p) =>
          [
            { ...p, to_min: Math.min(p.to_min, t.from_min) },
            { ...p, from_min: Math.max(p.from_min, t.to_min) },
          ].filter((q) => q.to_min > q.from_min),
        ),
      [s],
    ),
  );
  return [...kept, ...top].sort((a, b) => a.from_min - b.from_min);
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
// of `current`. Artist and publisher exclusions only grow (CLAUDE.md rule 2).
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
  // The source: one this request names, else the include already in force. A
  // format narrows it to the series that fit both and never cuts it to nothing.
  const source = named.length > 0 ? named : current.series_include;
  const both = source.filter((id) => format.includes(id));
  const wanted =
    source.length > 0 && format.length > 0
      ? both.length > 0
        ? both
        : source
      : source.length > 0
        ? source
        : format;

  const ruledOut = sources(model.sources_exclude, context);
  // A newly named source lifts an earlier series exclusion of itself, and a
  // format never excludes the source.
  const series_exclude = unique([
    ...current.series_exclude.filter((id) => !named.includes(id)),
    ...known(model.format_exclude).filter((id) => !source.includes(id)),
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
  const open = wanted.filter(
    (id) =>
      !series_exclude.includes(id) &&
      !publisher_ids.includes(publisherOf.get(id)!),
  );
  return {
    // Exclusions that shut every wanted series keep the include as asked: an
    // empty include would mean every series, the opposite of the request.
    series_include: open.length > 0 ? open : wanted,
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
