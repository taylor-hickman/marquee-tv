import { describe, expect, test } from "vitest";
import { brief as briefSchema, refineBrief, type Brief } from "@/contracts";
import { createFakeAdapter, type LlmAdapter } from "../llm";
import { type Case, type Expect, cases, context, current, list } from "./cases";
import {
  CHIP_TEXT,
  extractBrief,
  extractRefineBrief,
  fitCurve,
  overlayCurve,
} from "./index";
import {
  type ModelBrief,
  type ModelRefine,
  generateSystem,
  generateUser,
  refineSystem,
  refineUser,
} from "./prompt";
import recorded from "./recorded.json";

const outputs: Record<string, unknown> = recorded.outputs;
const everySeries = context.series.map((s) => s.id);

function replay(output: unknown): Pick<LlmAdapter, "extractBrief"> {
  return createFakeAdapter({ extractBrief: () => ({ output }) });
}

// The brief a refine leaves behind: delta fields replace the current ones, and
// the delta's curve is laid over the current curve.
function merged(delta: Partial<Brief>): Brief {
  return {
    ...current,
    ...delta,
    curve: overlayCurve(current.curve, delta.curve ?? []),
  };
}

function energyAt(b: Brief, fraction: number) {
  const minute = fraction * (b.duration_s / 60);
  return b.curve.find((s) => s.from_min <= minute && minute < s.to_min)?.energy;
}

// The curve runs from 0 to the set's length with no gap or overlap.
function spansTheSet(b: Brief) {
  expect(b.curve[0].from_min).toBe(0);
  expect(b.curve.at(-1)!.to_min).toBe(b.duration_s / 60);
  for (const [i, s] of b.curve.slice(1).entries()) {
    expect(s.from_min).toBe(b.curve[i].to_min);
  }
}

function allowed(b: Brief, seriesId: number) {
  const publisher = context.series.find((s) => s.id === seriesId)!.publisher_id;
  return (
    (b.series_include.length === 0 || b.series_include.includes(seriesId)) &&
    !b.series_exclude.includes(seriesId) &&
    !b.exclusions.publisher_ids.includes(publisher)
  );
}

function check(b: Brief, e: Expect) {
  const at = (f: number) => energyAt(b, f) ?? 0;
  const [start, mid, end] = [at(0.05), at(0.5), at(0.95)];
  if (e.shape === "rising") expect(end).toBeGreaterThan(start);
  if (e.shape === "falling") expect(end).toBeLessThan(start);
  if (e.shape === "peak") {
    expect(mid).toBeGreaterThan(start);
    expect(mid).toBeGreaterThan(end);
  }
  for (const [f, min, max] of e.energyAt ?? []) {
    expect(at(f), `energy at ${f}`).toBeGreaterThanOrEqual(min);
    expect(at(f), `energy at ${f}`).toBeLessThanOrEqual(max);
  }
  if (e.durationS) expect(b.duration_s).toBe(e.durationS);
  for (const id of e.allowed ?? [])
    expect(allowed(b, id), `series ${id} allowed`).toBe(true);
  for (const id of e.blocked ?? [])
    expect(allowed(b, id), `series ${id} blocked`).toBe(false);
  for (const id of e.included ?? []) expect(b.series_include).toContain(id);
  if (e.novelty) expect(b.novelty).toBe(e.novelty);
  if (e.surprise !== undefined) expect(b.surprise).toBe(e.surprise);
  for (const id of e.excludedArtists ?? [])
    expect(b.exclusions.artist_ids).toContain(id);
  for (const name of e.influences ?? []) {
    const influence = b.influences.find((i) => i.name === name);
    expect(influence?.genres.length, `${name} has genres`).toBeGreaterThan(0);
  }
  if (e.seeds) expect(b.seeds).toEqual(e.seeds);
}

async function run(c: Case) {
  const llm = replay(outputs[c.id]);
  if (c.kind === "generate") {
    const result = await extractBrief(c.input, context, { llm });
    if (!result.ok) throw new Error(`${c.id}: ${result.error}`);
    return { brief: briefSchema.parse(result.output) };
  }
  const result = await extractRefineBrief(
    { instruction: c.instruction, brief: current, list },
    context,
    { llm },
  );
  if (!result.ok) throw new Error(`${c.id}: ${result.error}`);
  return { refine: refineBrief.parse(result.output) };
}

describe("the prompt set", () => {
  test("has at least 30 prompts covering every chip and instruction type", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    const chips = new Set(
      cases.flatMap((c) => (c.kind === "generate" && c.input.mood) || []),
    );
    expect([...chips].sort()).toEqual(Object.keys(CHIP_TEXT).sort());
    const types = new Set(cases.flatMap((c) => c.types));
    expect([...types].sort()).toEqual([
      "energy",
      "familiarity",
      "format",
      "source",
      "structure",
    ]);
    for (const kind of ["generate", "refine"]) {
      const covered = new Set(
        cases.filter((c) => c.kind === kind).flatMap((c) => c.types),
      );
      expect(covered.size, kind).toBe(5);
    }
  });

  test("every case has a recorded output", () => {
    expect(Object.keys(outputs).sort()).toEqual(cases.map((c) => c.id).sort());
  });
});

describe("recorded outputs give the expected brief", () => {
  test.each(cases.map((c) => [c.id, c] as const))("%s", async (_, c) => {
    // Only a named source or format narrows the series; a mood or an energy never does.
    const narrows = c.types.includes("source") || c.types.includes("format");
    const result = await run(c);
    if (result.brief) {
      spansTheSet(result.brief);
      check(result.brief, c.expect);
      if (!narrows) check(result.brief, { allowed: everySeries });
      return;
    }
    const { delta, scope } = result.refine!;
    spansTheSet(merged(delta));
    check(merged(delta), c.expect);
    if (!narrows) check(merged(delta), { allowed: everySeries });
    for (const field of c.expect.unchanged ?? [])
      expect(delta).not.toHaveProperty(field);
    if (c.expect.scope === "whole") expect(scope).toBeNull();
    else if (c.expect.scope) {
      expect(scope).not.toBeNull();
      const { from, to } = c.expect.scope;
      expect(scope!.from_index).toBeGreaterThanOrEqual(from[0]);
      expect(scope!.from_index).toBeLessThanOrEqual(from[1]);
      expect(scope!.to_index).toBeGreaterThanOrEqual(to[0]);
      expect(scope!.to_index).toBeLessThanOrEqual(to[1]);
    }
  });
});

const input = { text: "mellow then groovy", durationS: 7200, seeds: [] };
const model: ModelBrief = {
  stated_length_min: null,
  curve: [{ from_min: 0, to_min: 120, energy: 3 }],
  genres: [],
  scenes: [],
  influences: [],
  sources_include: [],
  sources_exclude: [],
  format_include: [],
  format_exclude: [],
  novelty: "default",
  surprise: false,
  exclude_artists: [],
};

const unchanged: ModelRefine = {
  scope: null,
  stated_length_min: null,
  curve: null,
  genres: null,
  scenes: null,
  novelty: null,
  sources_include: [],
  sources_exclude: [],
  format_include: [],
  format_exclude: [],
  exclude_artists: [],
};

describe("code holds what the model may not decide", () => {
  test("a typed duration beats the control, and the curve spans it", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({
        ...model,
        stated_length_min: 90,
        curve: [
          { from_min: 0, to_min: 60, energy: 2 },
          { from_min: 60, to_min: 120, energy: 4 },
        ],
      }),
    });
    expect(result.ok && result.output.duration_s).toBe(5400);
    expect(result.ok && result.output.curve).toEqual([
      { from_min: 0, to_min: 45, energy: 2 },
      { from_min: 45, to_min: 90, energy: 4 },
    ]);
  });

  test("an out-of-range length falls back to the control", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({ ...model, stated_length_min: 1000 }),
    });
    expect(result.ok && result.output.duration_s).toBe(7200);
  });

  test("a source name fits every series it names, and an unknown one fits nothing", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({
        ...model,
        sources_include: ["Tiny Desk"],
        sources_exclude: ["KEXP", "Live Lounge"],
        exclude_artists: ["Khruangbin", "Nobody In The Catalog"],
      }),
    });
    expect(result.ok && result.output).toMatchObject({
      series_include: [1, 2],
      series_exclude: [3, 4],
      exclusions: { artist_ids: [1], publisher_ids: [] },
    });
  });

  test("one series of a publisher stays one series", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({
        ...model,
        sources_include: ["Live on KEXP"],
        sources_exclude: ["COLORS ENCORE"],
      }),
    });
    expect(result.ok && result.output).toMatchObject({
      series_include: [3],
      series_exclude: [6],
      exclusions: { publisher_ids: [] },
    });
  });

  test("a name that fits no series fits the publisher whose name contains it", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({ ...model, sources_exclude: ["NPR"] }),
    });
    expect(result.ok && result.output).toMatchObject({
      series_include: [],
      series_exclude: [],
      exclusions: { publisher_ids: [1] },
    });
  });

  test("a source and a format keep the series that fit both, and invented ids are dropped", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({
        ...model,
        sources_include: ["KEXP"],
        format_include: [3, 99],
        format_exclude: [5, 77],
      }),
    });
    expect(result.ok && result.output).toMatchObject({
      series_include: [3],
      series_exclude: [5],
    });
  });

  test("a format never cuts a named source to nothing", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({
        ...model,
        sources_include: ["KEXP"],
        format_include: [1, 5],
        format_exclude: [3, 4],
      }),
    });
    expect(result.ok && result.output).toMatchObject({
      series_include: [3, 4],
      series_exclude: [],
    });
  });

  test("a refine's format narrows the include already in force, and keeps it on a conflict", async () => {
    const tinyDeskOnly = { ...current, series_include: [1, 2] };
    const narrow = await extractRefineBrief(
      { instruction: "full band only", brief: tinyDeskOnly, list },
      context,
      {
        llm: replay({
          ...unchanged,
          format_include: [2, 3, 4],
          format_exclude: [1, 5, 6],
        }),
      },
    );
    expect(narrow.ok && narrow.output.delta).toMatchObject({
      series_include: [2],
      series_exclude: [5, 6],
    });
    const conflict = await extractRefineBrief(
      {
        instruction: "full band only",
        brief: { ...current, series_include: [1] },
        list,
      },
      context,
      { llm: replay({ ...unchanged, format_include: [3, 4] }) },
    );
    expect(conflict.ok && conflict.output.delta).not.toHaveProperty(
      "series_include",
    );
  });

  test("exclusions that shut every wanted series never leave the include open", async () => {
    const result = await extractRefineBrief(
      {
        instruction: "only Tiny Desk",
        brief: {
          ...current,
          exclusions: { artist_ids: [], publisher_ids: [1] },
        },
        list,
      },
      context,
      { llm: replay({ ...unchanged, sources_include: ["Tiny Desk"] }) },
    );
    expect(result.ok && result.output.delta.series_include).toEqual([1, 2]);
  });

  test("a new length stretches the current curve, with the delta's segments laid over it", async () => {
    const result = await extractRefineBrief(
      {
        instruction: "make it three hours, last half hour upbeat",
        brief: current,
        list,
      },
      context,
      {
        llm: replay({
          ...unchanged,
          stated_length_min: 180,
          curve: [{ from_min: 150, to_min: 180, energy: 4 }],
        }),
      },
    );
    expect(result.ok && result.output.delta).toEqual({
      duration_s: 10800,
      curve: [
        { from_min: 0, to_min: 60, energy: 2 },
        { from_min: 60, to_min: 150, energy: 3 },
        { from_min: 150, to_min: 180, energy: 4 },
      ],
    });
  });

  test("seeds come from the input, never the model", async () => {
    const result = await extractBrief(
      {
        ...input,
        mood: "surprise_me",
        seeds: [
          { artistId: 37, name: "Vulfpeck", mustInclude: false },
          { name: "Radiohead", mustInclude: false },
        ],
      },
      context,
      { llm: replay(model) },
    );
    expect(result.ok && result.output.seeds).toEqual([
      { artist_id: 37, must_include: false },
    ]);
    expect(result.ok && result.output.surprise).toBe(true);
  });

  test("rule 2: a refine keeps every earlier exclusion", async () => {
    const result = await extractRefineBrief(
      { instruction: "no Live Lounge", brief: current, list },
      context,
      {
        llm: replay({ ...unchanged, exclude_artists: ["Mitski"] }),
      },
    );
    expect(result.ok && result.output).toEqual({
      delta: { exclusions: { artist_ids: [12, 7], publisher_ids: [] } },
      scope: null,
    });
  });

  test("an empty genre or scene list in a refine leaves the current ones alone", async () => {
    const result = await extractRefineBrief(
      { instruction: "calmer", brief: current, list },
      context,
      {
        llm: replay({
          ...unchanged,
          genres: [],
          scenes: [],
          novelty: "default",
        }),
      },
    );
    expect(result.ok && result.output).toEqual({
      delta: { novelty: "default" },
      scope: null,
    });
  });

  test("a scope is clamped to the list and ordered", async () => {
    const result = await extractRefineBrief(
      { instruction: "the end", brief: current, list },
      context,
      {
        llm: replay({
          ...unchanged,
          scope: { from_index: 40, to_index: 12 },
          curve: [{ from_min: 100, to_min: 400, energy: 4 }],
        }),
      },
    );
    expect(result.ok && result.output).toEqual({
      delta: { curve: [{ from_min: 100, to_min: 120, energy: 4 }] },
      scope: { from_index: 12, to_index: 19 },
    });
  });

  test("a schema failure is retried once, then surfaces", async () => {
    const result = await extractBrief(input, context, {
      llm: replay({ curve: [] }),
    });
    expect(result).toMatchObject({ ok: false, error: "schema" });
    expect(!result.ok && result.calls).toHaveLength(2);
  });

  test("a curve with a gap is joined end to end and stretched to the set", () => {
    expect(
      fitCurve(
        [
          { from_min: 50, to_min: 100, energy: 4 },
          { from_min: 0, to_min: 40, energy: 2 },
          { from_min: 30, to_min: 30, energy: 5 },
        ],
        60,
      ),
    ).toEqual([
      { from_min: 0, to_min: 30, energy: 2 },
      { from_min: 30, to_min: 60, energy: 4 },
    ]);
  });

  test("a peak nested inside a longer segment survives, and the curve ends at the set's length", () => {
    expect(
      fitCurve(
        [
          { from_min: 0, to_min: 60, energy: 2 },
          { from_min: 30, to_min: 120, energy: 4 },
          { from_min: 90, to_min: 100, energy: 5 },
        ],
        120,
      ),
    ).toEqual([
      { from_min: 0, to_min: 30, energy: 2 },
      { from_min: 30, to_min: 90, energy: 4 },
      { from_min: 90, to_min: 100, energy: 5 },
      { from_min: 100, to_min: 120, energy: 4 },
    ]);
  });

  test("a curve delta replaces the current curve over its span only", () => {
    expect(
      overlayCurve(current.curve, [{ from_min: 30, to_min: 100, energy: 5 }]),
    ).toEqual([
      { from_min: 0, to_min: 30, energy: 2 },
      { from_min: 30, to_min: 100, energy: 5 },
      { from_min: 100, to_min: 120, energy: 3 },
    ]);
  });
});

describe("prompts", () => {
  test("the system prompt is the same for every request against one catalog", () => {
    const reversed = { ...context, series: [...context.series].reverse() };
    expect(generateSystem(reversed)).toBe(generateSystem(context));
    expect(refineSystem(reversed)).toBe(refineSystem(context));
  });

  test("a chip becomes prompt text", () => {
    expect(generateUser({ ...input, text: "", mood: "after_hours" })).toContain(
      CHIP_TEXT.after_hours,
    );
  });

  test("rule 5: the refine prompt carries artist and series, never a title", () => {
    const user = refineUser("calmer", current, list);
    expect(user).toContain("0 | 0 | Khruangbin | Tiny Desk Concerts | pinned");
    expect(user).not.toMatch(/title/i);
  });
});
