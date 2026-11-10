import { describe, expect, it } from "vitest";
import { check, passed, report, summarize, type RunResult } from "./check";

const artist = (id: number) => ({ id, name: `Artist ${id}` });

// Four 30-minute sets against a 2-hour target, each id a candidate, tracks 1
// and 3 pinned in the state generate got.
function clean(): RunResult {
  return {
    prompt: 1,
    run: 1,
    input: { text: "Warm", durationS: 7200, seeds: [] },
    pins: [
      { id: 10, pinned: "position", index: 0 },
      { id: 12, pinned: "include", index: 2 },
    ],
    error: null,
    model: "claude-sonnet-5-5",
    latencyMs: 4000,
    tokensIn: 3000,
    tokensOut: 400,
    targetS: 7200,
    candidateIds: [11, 12, 13, 14],
    droppedIds: [],
    items: [10, 11, 12, 13].map((id) => ({
      id,
      pinned: id === 10 ? "position" : id === 12 ? "include" : "none",
      artists: [artist(id)],
      series: "Tiny Desk Concerts",
      durationS: 1800,
    })),
    warnings: [],
    title: "Warm",
    arc: "Mellow to upbeat",
  };
}

describe("check", () => {
  it("passes a run that holds every invariant", () => {
    expect(check([clean()])).toEqual([]);
  });

  it("accepts a pin that is not a candidate", () => {
    const r = clean();
    expect(r.candidateIds).not.toContain(10);
    expect(check([r])).toEqual([]);
  });

  it("fails an id outside the candidate set", () => {
    const r = clean();
    r.items[1].id = 999;
    expect(check([r])).toEqual([
      expect.objectContaining({ invariant: "candidate_set" }),
    ]);
  });

  it("fails a pin that is gone", () => {
    const r = clean();
    r.items[2] = { ...r.items[2], id: 14, pinned: "none" };
    expect(check([r]).map((v) => v.detail)).toEqual(["pin 12 is gone"]);
  });

  it("fails a pin that lost its kind", () => {
    const r = clean();
    r.items[0].pinned = "none";
    expect(check([r]).map((v) => v.invariant)).toEqual(["pins_intact"]);
  });

  it("fails a position pin that moved, and lets an include pin move", () => {
    const r = clean();
    r.items = [r.items[2], r.items[0], r.items[1], r.items[3]];
    expect(check([r]).map((v) => v.detail)).toEqual([
      "pin 10 moved from track 1 to 2",
    ]);
  });

  it("fails a length outside ±10% of the brief's target", () => {
    const r = clean();
    r.targetS = 5400;
    expect(check([r]).map((v) => v.detail)).toEqual([
      "120 min against a target of 90 min",
    ]);
    r.targetS = 6600;
    expect(check([r])).toEqual([]);
  });

  it("fails an item with no duration", () => {
    const r = clean();
    r.items[3].durationS = null;
    expect(check([r]).map((v) => v.invariant)).toEqual(["duration_in_range"]);
  });

  it("fails a third appearance of one artist, counting every billed artist", () => {
    const r = clean();
    r.items[1].artists = [artist(10)];
    expect(check([r])).toEqual([]);
    r.items[3].artists = [artist(13), artist(10)];
    expect(check([r]).map((v) => v.detail)).toEqual([
      "Artist 10 appears 3 times",
    ]);
  });

  it("skips the invariants on a run that failed to finish", () => {
    const r = { ...clean(), error: "timeout", items: [], targetS: null };
    expect(check([r])).toEqual([]);
  });
});

describe("summarize", () => {
  it("passes only with runs, no errors and no violations", () => {
    expect(passed(summarize([clean()]))).toBe(true);
    expect(passed(summarize([]))).toBe(false);
    expect(passed(summarize([{ ...clean(), error: "schema" }]))).toBe(false);
    const invented = clean();
    invented.items[1].id = 999;
    expect(passed(summarize([invented]))).toBe(false);
  });

  it("totals tokens and reads latency percentiles", () => {
    const runs = Array.from({ length: 10 }, (_, i) => ({
      ...clean(),
      run: i + 1,
      latencyMs: (i + 1) * 1000,
    }));
    const s = summarize(runs);
    expect(s.latencyMs).toEqual({ p50: 5000, p90: 9000, max: 10000 });
    expect(s.tokens).toEqual({ in: 30000, out: 4000 });
  });

  it("reports each violation by prompt and run", () => {
    const r = clean();
    r.items[1].id = 999;
    expect(report(summarize([r]))).toContain(
      "- Prompt 1, run 1, candidate_set: 999 is not in the candidate set",
    );
  });
});
