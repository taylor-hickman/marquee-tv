// The model for the generate and refine route tests. Each test file replaces
// @/modules/curator/llm with `mockLlm`, so the real curator runs on the seeded
// catalog and only the model's replies are scripted here.
import type { z } from "zod";
import type { Brief } from "@/contracts";

type Fn = "extractBrief" | "compose";
type LlmModule = {
  createFakeAdapter: (script: object) => Record<Fn, Call>;
};
type Call = (
  input: { system: string; user: string },
  schema: z.ZodType,
  options?: object,
) => Promise<unknown>;

export const llm = {
  // Each call, in order.
  calls: [] as Fn[],
  // Runs before each call, so a test can hold the model or check what the
  // client has seen by then.
  before: null as null | ((fn: Fn) => Promise<void> | void),
  error: null as null | "provider",
};

export function resetLlm() {
  llm.calls = [];
  llm.before = null;
  llm.error = null;
}

// What the routes hand next/server's `after`: each run, which goes on after
// its response.
export const background: Promise<unknown>[] = [];
export const settle = () => Promise.all(background.splice(0));

// A one-hour brief from energy 2 to 4, with no genres, so retrieval matches on
// energy alone; a refine changes nothing in the brief.
const modelBrief = {
  stated_length_min: null,
  curve: [
    { from_min: 0, to_min: 30, energy: 2 },
    { from_min: 30, to_min: 60, energy: 4 },
  ],
  genres: [],
  scenes: [],
  sources_include: [],
  sources_exclude: [],
  format_include: [],
  format_exclude: [],
  exclude_artists: [],
  influences: [],
  novelty: "default",
  surprise: false,
};
const modelRefine = {
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

// The candidate ids from the compose prompt's table, in order.
function candidateIds(user: string): number[] {
  const table = user.split("\nCandidates:\n")[1] ?? "";
  return table
    .split("\n")
    .slice(1)
    .map((line) => Number(line.split("|")[0]))
    .filter((id) => Number.isInteger(id) && id > 0);
}

const reply = (fn: Fn, user: string, schema: z.ZodType): unknown => {
  if (fn === "extractBrief") {
    return schema.safeParse(modelBrief).success ? modelBrief : modelRefine;
  }
  const ids = candidateIds(user);
  const set = { ids: ids.slice(0, 6), title: "Warm room", arc: "Easy to up" };
  return schema.safeParse(set).success
    ? set
    : {
        ops: [{ op: "add", performance_id: ids[0], index: 0 }],
        title: "Warmer room",
        arc: "Easy, then up",
      };
};

// The module @/modules/curator/llm becomes: the real one, with extractBrief
// and compose answered by the fake adapter from the replies above.
export function mockLlm<T extends LlmModule>(real: T): T {
  const adapter = real.createFakeAdapter({
    extractBrief: (input: { user: string }, schema: z.ZodType) =>
      llm.error
        ? { error: llm.error }
        : { output: reply("extractBrief", input.user, schema) },
    compose: (input: { user: string }, schema: z.ZodType) => ({
      output: reply("compose", input.user, schema),
    }),
  });
  const call =
    (fn: Fn): Call =>
    async (...args) => {
      await llm.before?.(fn);
      llm.calls.push(fn);
      return adapter[fn](...args);
    };
  return {
    ...real,
    extractBrief: call("extractBrief"),
    compose: call("compose"),
  };
}

// A brief as a generated revision holds it: an hour of energy 3.
export const heldBrief: Brief = {
  curve: [{ from_min: 0, to_min: 60, energy: 3 }],
  genres: [],
  scenes: [],
  seeds: [],
  influences: [],
  series_include: [],
  series_exclude: [],
  novelty: "default",
  surprise: false,
  exclusions: { artist_ids: [], publisher_ids: [] },
  duration_s: 3600,
};
