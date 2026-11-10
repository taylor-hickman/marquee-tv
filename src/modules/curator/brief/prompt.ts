// The brief step's prompts (architecture 6.2 step 1, 6.3 refine row) and the
// shapes the small model writes. Code turns those into a `brief` or a
// `refineBrief` (./index.ts): ids are checked there, never trusted here.
import { z } from "zod";
import type { Brief, BriefInput } from "@/contracts";

export type BriefCatalog = {
  publishers: { id: number; name: string }[];
  series: {
    id: number;
    publisher_id: number;
    name: string;
    convention: string;
  }[];
};

// One row of the current list as the refine step sees it. No titles (CLAUDE.md rule 5).
export type ListRow = {
  index: number;
  // Minutes from the start of the set; null when an earlier item's duration is unknown.
  start_min: number | null;
  artist: string;
  series: string;
  pinned: boolean;
};

// Mood chips as prompt text (PRD 7.1). The chip prefills the prompt box; this
// tells the model what the chip means even when the person rewrote the text.
export const CHIP_TEXT: Record<NonNullable<BriefInput["mood"]>, string> = {
  dinner_party:
    "Dinner party: warm and unhurried, energy 2 to 3, nothing that drowns out conversation; it may lift a little near the end.",
  friends_over:
    "Friends over: relaxed but social, starting around 2 to 3 and building to a 4 by the end.",
  sunday_morning:
    "Sunday morning: gentle and acoustic-leaning, energy 1 to 2 throughout.",
  after_hours:
    "After hours: moody and hypnotic, a slow burn that stays between 2 and 3.",
  high_energy:
    "High energy: loud and danceable, 4 to 5 nearly all the way, with at most a short breather.",
  surprise_me:
    "Surprise me: genres the listener would not expect, mixed widely, with any arc that works.",
};

const segment = z.object({
  from_min: z.number(),
  to_min: z.number(),
  energy: z.number().int().min(1).max(5),
});

// Sources come by name and code matches them to the catalog; formats come as
// series ids, judged by each series' convention.
const shared = {
  genres: z.array(z.string()),
  scenes: z.array(z.string()),
  sources_include: z.array(z.string()),
  sources_exclude: z.array(z.string()),
  format_include: z.array(z.number().int()),
  format_exclude: z.array(z.number().int()),
  exclude_artists: z.array(z.string()),
};

// What the model writes for a new set.
export const modelBrief = z.object({
  stated_length_min: z.number().nullable(),
  curve: z.array(segment).min(1),
  ...shared,
  influences: z.array(
    z.object({
      name: z.string(),
      genres: z.array(z.string()),
      scenes: z.array(z.string()),
      energy: z.number().int().min(1).max(5),
    }),
  ),
  novelty: z.enum(["default", "prefer_unfamiliar"]),
  surprise: z.boolean(),
});
export type ModelBrief = z.infer<typeof modelBrief>;

// What the model writes for a refine: null or an empty list means unchanged.
export const modelRefine = z.object({
  scope: z
    .object({ from_index: z.number().int(), to_index: z.number().int() })
    .nullable(),
  stated_length_min: z.number().nullable(),
  curve: z.array(segment).nullable(),
  ...shared,
  genres: z.array(z.string()).nullable(),
  scenes: z.array(z.string()).nullable(),
  novelty: z.enum(["default", "prefer_unfamiliar"]).nullable(),
});
export type ModelRefine = z.infer<typeof modelRefine>;

const ENERGY =
  "Energy runs 1 to 5: 1 hushed and still, 2 mellow, 3 an easy groove, 4 upbeat and danceable, 5 loud and at full peak.";

const FIELDS = `- genres, scenes: lowercase, at most 6 each. Scenes are places or movements ("london jazz", "desert blues", "seattle").
- sources_include: sources the request asks for, named as it names them ("more KEXP" is "KEXP", "only Tiny Desk sets" is "Tiny Desk").
- sources_exclude: sources the request rules out ("no COLORS" is "COLORS", "no Live Lounge" is "Live Lounge").
- format_include, format_exclude: series ids, only when the request names a performance format ("full band only", "stripped back", "just a voice and a beat"). Include the series whose convention plainly fits the format, exclude the ones whose convention plainly doesn't, and leave out of both any series you're unsure of.
A mood, an energy level or a genre is not a source or a format, and the Mood line never names one: unless the request's own words name a source or a format, those four lists stay empty.
- exclude_artists: artist names the request rules out ("no Mitski", "drop Khruangbin").
- novelty: "prefer_unfamiliar" when the request asks for artists they don't know, deep cuts, discoveries, nothing too famous; otherwise "default".
Use only series ids from the list below. Never invent an id.`;

function catalogText(catalog: BriefCatalog): string {
  const publishers = [...catalog.publishers].sort((a, b) => a.id - b.id);
  const series = [...catalog.series].sort((a, b) => a.id - b.id);
  const name = new Map(publishers.map((p) => [p.id, p.name]));
  return [
    `Publishers: ${publishers.map((p) => p.name).join("; ")}`,
    "",
    "Series (id: name, publisher, convention):",
    ...series.map(
      (s) => `${s.id}: ${s.name}, ${name.get(s.publisher_id)}, ${s.convention}`,
    ),
  ].join("\n");
}

// Fixed per catalog, so the cache holds between requests (llm/index.ts).
export function generateSystem(catalog: BriefCatalog): string {
  return `You turn a request for a set of live music sessions into a brief. A later step picks real performances from a catalog to fit it. The set plays back to back for a room of people.

${ENERGY}

Fields:
- stated_length_min: the total length the Request line states, in minutes ("90 minutes" is 90, "three hours" 180, "half an hour" 30). A length for part of the set ("the first 20 minutes", "the last hour") is not the total. Never copy the control's length here: null when the Request states no total.
- curve: the energy across the whole set as segments in minutes from 0 to its length (stated_length_min when set, otherwise the control's length), in order and without gaps; one segment for a flat set, at most 6. Energy and structure instructions ("mellow then groovy", "loud for the first hour", "calmer in the middle", "upbeat last 30 minutes") shape it. With no cue, follow the mood; with no mood, start a notch low, lift through the middle and settle at the end.
- influences: one entry per artist given under Influences or named as a reference in the request ("something like Radiohead"), with that artist's usual genres, scenes and energy. Not for artists under Seeds.
- surprise: true when the request or mood asks to be surprised.
${FIELDS}

${catalogText(catalog)}`;
}

export function refineSystem(catalog: BriefCatalog): string {
  return `You turn an instruction about an existing set of live music sessions into a change to its brief. A later step edits the set to fit the changed brief. The set plays back to back for a room of people.

${ENERGY}

Write only what the instruction changes; leave every other field null, or an empty list.
- scope: the stretch of the current list the instruction is about, as list indexes, inclusive. "The second half" is the items starting at or after half the length; "keep the first five" is index 5 to the last; "the last 30 minutes" starts at the first item whose start minute is at or after the length minus 30. Null when it is about the whole set.
- curve: segments for only the stretch whose energy changes, in minutes from the start of the set, inside the set's length. "Funkier" or "more upbeat" raises energy by 1 or 2; "calmer" lowers it. Null when energy doesn't change.
- stated_length_min: a new total length when the instruction states one ("make it three hours" is 180), otherwise null.
${FIELDS}

${catalogText(catalog)}`;
}

export function generateUser(input: BriefInput): string {
  const seeds = input.seeds.filter((s) => "artistId" in s).map((s) => s.name);
  const influences = input.seeds
    .filter((s) => !("artistId" in s))
    .map((s) => s.name);
  return [
    `Request: ${input.text.trim() || "(none)"}`,
    input.mood && `Mood: ${CHIP_TEXT[input.mood]}`,
    `Control length: ${input.durationS / 60} minutes, used only when the Request states no total`,
    seeds.length > 0 && `Seeds: ${seeds.join("; ")}`,
    influences.length > 0 && `Influences: ${influences.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function refineUser(
  instruction: string,
  brief: Brief,
  list: ListRow[],
): string {
  const current = {
    duration_min: brief.duration_s / 60,
    curve: brief.curve,
    genres: brief.genres,
    scenes: brief.scenes,
    series_include: brief.series_include,
    series_exclude: brief.series_exclude,
    novelty: brief.novelty,
  };
  return [
    `Instruction: ${instruction.trim()}`,
    `Current brief: ${JSON.stringify(current)}`,
    "Current list (index | start minute | artist | series | pinned):",
    ...list.map(
      (r) =>
        `${r.index} | ${r.start_min ?? "?"} | ${r.artist} | ${r.series} | ${r.pinned ? "pinned" : ""}`,
    ),
  ].join("\n");
}
