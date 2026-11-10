// The brief step's prompt set: every chip and PRD 7.4's five instruction types,
// for new sets and refines, against the fixture catalog. brief.test.ts checks
// each against recorded.json; record.ts refreshes that file from the real model.
import type { Brief, BriefInput } from "@/contracts";
import catalogJson from "../../../../db/fixtures/catalog.json";
import type { BriefContext, ListRow } from "./index";

export const context: BriefContext = {
  publishers: catalogJson.publishers.map(({ id, name }) => ({ id, name })),
  series: catalogJson.series.map(({ id, publisher_id, name, convention }) => ({
    id,
    publisher_id,
    name,
    convention,
  })),
  artistIdFor: async (name) => {
    const key = name.trim().toLowerCase();
    const artist = catalogJson.artists.find((a) =>
      [a.name, ...a.aliases].some((n) => n.toLowerCase() === key),
    );
    return artist?.id ?? null;
  },
};

// Fixture series: 1 Tiny Desk Concerts, 2 Tiny Desk Home Concerts (NPR Music, 1);
// 3 Live on KEXP, 4 KEXP at Home (KEXP, 2); 5 A COLORS SHOW, 6 A COLORS ENCORE (COLORS, 3).
const KEXP = [3, 4];
const TINY_DESK = [1, 2];
const COLORS = [5, 6];

type Instruction = "energy" | "source" | "familiarity" | "structure" | "format";

// Energy at a fraction of the set: [fraction, at least, at most].
type EnergyAt = [number, number, number];

export type Expect = {
  shape?: "rising" | "falling" | "peak";
  energyAt?: EnergyAt[];
  durationS?: number;
  // Series a retrieval under the brief may still draw from, and ones it may not.
  allowed?: number[];
  blocked?: number[];
  included?: number[];
  novelty?: Brief["novelty"];
  surprise?: boolean;
  excludedArtists?: number[];
  influences?: string[];
  seeds?: Brief["seeds"];
  // Refine only. "whole" is a null scope.
  scope?: "whole" | { from: [number, number]; to: [number, number] };
  // Refine only: fields the delta must leave out.
  unchanged?: (keyof Brief)[];
};

type Base = { id: string; types: Instruction[]; expect: Expect };
export type GenerateCase = Base & { kind: "generate"; input: BriefInput };
export type RefineCase = Base & { kind: "refine"; instruction: string };
export type Case = GenerateCase | RefineCase;

const H2 = 7200;

function generate(
  id: string,
  types: Instruction[],
  input: Partial<BriefInput> & { text: string },
  expect: Expect,
): GenerateCase {
  return {
    id,
    kind: "generate",
    types,
    input: { durationS: H2, seeds: [], ...input },
    expect,
  };
}

function refine(
  id: string,
  types: Instruction[],
  instruction: string,
  expect: Expect,
): RefineCase {
  return { id, kind: "refine", types, instruction, expect };
}

// The set every refine case starts from: two hours, 20 items of 6 minutes.
export const current: Brief = {
  curve: [
    { from_min: 0, to_min: 40, energy: 2 },
    { from_min: 40, to_min: 90, energy: 3 },
    { from_min: 90, to_min: 120, energy: 3 },
  ],
  genres: ["soul", "funk", "psychedelic soul"],
  scenes: [],
  seeds: [{ artist_id: 1, must_include: true }],
  influences: [],
  series_include: [],
  series_exclude: [],
  novelty: "default",
  surprise: false,
  exclusions: { artist_ids: [12], publisher_ids: [] },
  duration_s: H2,
};

const listArtists = [
  "Khruangbin",
  "Black Pumas",
  "Leon Bridges",
  "Durand Jones & The Indications",
  "Thee Sacred Souls",
  "Hiatus Kaiyote",
  "Tom Misch",
  "Cleo Sol",
  "Masego",
  "Lianne La Havas",
  "Vulfpeck",
  "Cory Wong",
  "Thundercat",
  "Jungle",
  "Parcels",
  "Anderson .Paak",
  "Lizzo",
  "Tank and the Bangas",
  "Trombone Shorty",
  "Khruangbin",
];
const seriesNames = [
  "Tiny Desk Concerts",
  "Live on KEXP",
  "A COLORS SHOW",
  "Tiny Desk Home Concerts",
];

export const list: ListRow[] = listArtists.map((artist, index) => ({
  index,
  start_min: index * 6,
  artist,
  series: seriesNames[index % seriesNames.length],
  pinned: index === 0 || index === 19,
}));

export const cases: Case[] = [
  // Each chip with no text of its own.
  generate(
    "chip-dinner-party",
    ["energy"],
    { text: "", mood: "dinner_party" },
    {
      energyAt: [
        [0.1, 1, 3],
        [0.5, 2, 3],
      ],
      durationS: H2,
    },
  ),
  generate(
    "chip-friends-over",
    ["energy"],
    { text: "", mood: "friends_over" },
    {
      shape: "rising",
      energyAt: [
        [0.1, 2, 3],
        [0.9, 3, 5],
      ],
    },
  ),
  generate(
    "chip-sunday-morning",
    ["energy"],
    { text: "", mood: "sunday_morning" },
    {
      energyAt: [
        [0.1, 1, 2],
        [0.5, 1, 2],
        [0.9, 1, 3],
      ],
    },
  ),
  generate(
    "chip-after-hours",
    ["energy"],
    { text: "", mood: "after_hours" },
    {
      energyAt: [
        [0.1, 1, 3],
        [0.5, 2, 3],
        [0.9, 1, 3],
      ],
    },
  ),
  generate(
    "chip-high-energy",
    ["energy"],
    { text: "", mood: "high_energy" },
    {
      energyAt: [
        [0.25, 4, 5],
        [0.5, 4, 5],
        [0.75, 4, 5],
      ],
    },
  ),
  generate(
    "chip-surprise-me",
    ["energy"],
    { text: "", mood: "surprise_me" },
    {
      surprise: true,
    },
  ),
  generate(
    "chip-dinner-with-text",
    ["energy"],
    { text: "Dinner party, mellow then groovy", mood: "dinner_party" },
    { shape: "rising", energyAt: [[0.1, 1, 3]] },
  ),

  // Energy.
  generate(
    "energy-mellow-then-groovy",
    ["energy"],
    { text: "mellow then groovy" },
    {
      shape: "rising",
      energyAt: [
        [0.1, 1, 2],
        [0.9, 3, 5],
      ],
    },
  ),
  generate(
    "energy-wind-down",
    ["energy"],
    { text: "start loud and wind it down at the end" },
    {
      shape: "falling",
      energyAt: [
        [0.1, 4, 5],
        [0.95, 1, 3],
      ],
    },
  ),
  generate(
    "energy-calm-throughout",
    ["energy"],
    { text: "calm the whole way, nothing loud, quiet background music" },
    {
      energyAt: [
        [0.1, 1, 2],
        [0.5, 1, 2],
        [0.9, 1, 2],
      ],
    },
  ),
  generate(
    "energy-peak-middle",
    ["energy", "structure"],
    { text: "build to a peak in the middle then bring it back down" },
    { shape: "peak" },
  ),

  // Structure.
  generate(
    "structure-loud-then-chill",
    ["structure", "energy"],
    { text: "high energy for the first hour, then chill for the last hour" },
    {
      shape: "falling",
      energyAt: [
        [0.25, 4, 5],
        [0.75, 1, 2],
      ],
      durationS: H2,
    },
  ),
  generate(
    "structure-last-30-upbeat",
    ["structure", "energy"],
    { text: "laid back soul, but make the last 30 minutes upbeat" },
    {
      shape: "rising",
      energyAt: [
        [0.3, 1, 3],
        [0.9, 4, 5],
      ],
      durationS: H2,
    },
  ),
  generate(
    "structure-part-length-not-total",
    ["structure", "energy"],
    { text: "keep it loud for the first 20 minutes", durationS: 3600 },
    { energyAt: [[0.1, 4, 5]], durationS: 3600 },
  ),

  // Source.
  generate(
    "source-only-kexp",
    ["source"],
    { text: "only KEXP sessions" },
    {
      allowed: KEXP,
      blocked: [...TINY_DESK, ...COLORS],
    },
  ),
  generate(
    "source-no-colors",
    ["source"],
    { text: "indie rock, no COLORS" },
    {
      allowed: [...KEXP, ...TINY_DESK],
      blocked: COLORS,
    },
  ),
  generate(
    "source-tiny-desk",
    ["source"],
    { text: "Tiny Desk sets please" },
    {
      allowed: [1],
      blocked: [...KEXP, ...COLORS],
    },
  ),
  generate(
    "source-more-kexp-no-tiny-desk",
    ["source"],
    { text: "more KEXP, no Tiny Desk" },
    { included: [3], blocked: TINY_DESK },
  ),
  generate(
    "source-unknown-series",
    ["source"],
    { text: "no Live Lounge covers" },
    { allowed: [...KEXP, ...TINY_DESK, ...COLORS] },
  ),

  // Format.
  generate(
    "format-full-band",
    ["format"],
    { text: "full band only, no solo acts" },
    {
      allowed: [3],
      blocked: [1, 5, 6],
    },
  ),
  generate(
    "format-stripped-back",
    ["format", "energy"],
    { text: "acoustic and stripped back" },
    { allowed: [1], blocked: [3], energyAt: [[0.5, 1, 3]] },
  ),
  generate(
    "format-voice-and-beat",
    ["format"],
    { text: "just a voice and a beat, one song each" },
    { allowed: [5], blocked: [3] },
  ),

  // Familiarity.
  generate(
    "familiarity-never-heard",
    ["familiarity"],
    { text: "artists I've never heard of" },
    { novelty: "prefer_unfamiliar" },
  ),
  generate(
    "familiarity-deep-cuts",
    ["familiarity"],
    { text: "deep cuts, nothing too famous, some west african desert blues" },
    { novelty: "prefer_unfamiliar" },
  ),
  generate(
    "familiarity-crowd-pleasers",
    ["familiarity"],
    { text: "crowd pleasers everyone knows" },
    { novelty: "default" },
  ),

  // Duration: the text wins over the control (PRD 18.1).
  generate(
    "duration-90-min",
    ["energy"],
    { text: "90 minutes of soul" },
    {
      durationS: 5400,
    },
  ),
  generate(
    "duration-three-hours",
    ["energy"],
    { text: "a three hour party, keep it moving", durationS: 3600 },
    { durationS: 10800, energyAt: [[0.5, 3, 5]] },
  ),
  generate(
    "duration-half-hour",
    ["energy"],
    { text: "half an hour of jazz" },
    {
      durationS: 1800,
    },
  ),
  generate(
    "duration-control-only",
    ["energy"],
    { text: "warm soul and funk", durationS: 3600 },
    { durationS: 3600 },
  ),

  // Seeds, influences, exclusions.
  generate(
    "seed-must-include-and-influence",
    ["energy"],
    {
      text: "",
      mood: "friends_over",
      seeds: [
        { artistId: 1, name: "Khruangbin", mustInclude: true },
        { name: "Radiohead", mustInclude: false },
      ],
    },
    {
      seeds: [{ artist_id: 1, must_include: true }],
      influences: ["Radiohead"],
    },
  ),
  generate(
    "influence-in-text",
    ["energy"],
    { text: "something like Portishead, dark and slow" },
    { influences: ["Portishead"], energyAt: [[0.5, 1, 3]] },
  ),
  generate(
    "exclusion-artist",
    ["source"],
    { text: "psychedelic funk, but no Khruangbin" },
    { excludedArtists: [1] },
  ),
  generate(
    "combined-chip-source-duration",
    ["source", "energy"],
    { text: "only KEXP, 45 minutes", mood: "high_energy", durationS: H2 },
    {
      durationS: 2700,
      allowed: KEXP,
      blocked: [...TINY_DESK, ...COLORS],
      energyAt: [
        [0.25, 4, 5],
        [0.75, 4, 5],
      ],
    },
  ),

  // Refines against `current` and `list`: 20 items, 6 minutes each.
  refine(
    "refine-funkier-second-half",
    ["energy"],
    "funkier in the second half",
    {
      energyAt: [
        [0.25, 2, 2],
        [0.75, 4, 5],
      ],
      scope: { from: [9, 10], to: [19, 19] },
      unchanged: ["series_include", "series_exclude", "novelty"],
    },
  ),
  refine("refine-calmer-middle", ["energy"], "calmer in the middle", {
    energyAt: [[0.5, 1, 2]],
    scope: { from: [4, 8], to: [11, 15] },
  }),
  refine("refine-more-kexp", ["source"], "more KEXP", {
    included: [3],
    unchanged: ["curve", "novelty"],
  }),
  refine("refine-no-colors", ["source"], "no COLORS", {
    blocked: COLORS,
    allowed: [...KEXP, ...TINY_DESK],
  }),
  refine("refine-unknown-series", ["source"], "no Live Lounge", {
    allowed: [...KEXP, ...TINY_DESK, ...COLORS],
    unchanged: ["curve", "novelty"],
  }),
  refine("refine-unfamiliar", ["familiarity"], "more artists I don't know", {
    novelty: "prefer_unfamiliar",
    scope: "whole",
    unchanged: ["curve"],
  }),
  refine("refine-keep-first-five", ["structure"], "keep the first five", {
    scope: { from: [5, 5], to: [19, 19] },
  }),
  refine(
    "refine-last-30-upbeat",
    ["structure", "energy"],
    "make the last 30 minutes upbeat",
    {
      energyAt: [
        [0.25, 2, 2],
        [0.9, 4, 5],
      ],
      scope: { from: [14, 15], to: [19, 19] },
    },
  ),
  refine("refine-full-band", ["format"], "full band only", {
    allowed: [3],
    blocked: [1, 5, 6],
  }),
  refine("refine-drop-artist", ["source"], "drop Khruangbin", {
    excludedArtists: [1, 12],
    unchanged: ["curve", "series_include", "series_exclude"],
  }),
  refine("refine-three-hours", ["structure"], "make it three hours", {
    durationS: 10800,
  }),
];
