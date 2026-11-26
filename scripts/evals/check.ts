// The invariants architecture 6.5 names, checked from a results file alone, so
// an edited file fails the same way a bad run does.
import type { BriefInput, CuratorWarning } from "@/contracts";

// PRD 8.2's limits, fixed here rather than imported from repair, so a change
// to repair cannot loosen the check.
const ARTIST_CAP = 2;
const DURATION_TOLERANCE = 0.1;

export type Pinned = "none" | "include" | "position";

// One generate run as the results file records it.
export type RunResult = {
  prompt: number;
  run: number;
  input: BriefInput;
  // Pins in the state handed to generate, at their indexes in that list.
  pins: { id: number; pinned: Exclude<Pinned, "none">; index: number }[];
  // Null when the run produced a proposal; otherwise why it stopped.
  error: string | null;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  // The brief's duration_s, which repair targets.
  targetS: number | null;
  candidateIds: number[];
  // Composer ids outside the candidate set that repair dropped.
  droppedIds: number[];
  items: {
    id: number;
    pinned: Pinned;
    artists: { id: number; name: string }[];
    series: string;
    // Null once the performance's cache row has expired.
    durationS: number | null;
  }[];
  warnings: CuratorWarning[];
  title: string | null;
  arc: string | null;
};

export type Results = {
  startedAt: string;
  commit: string | null;
  runs: number;
  results: RunResult[];
};

export type Invariant =
  "candidate_set" | "pins_intact" | "duration_in_range" | "artist_cap";

export type Violation = {
  prompt: number;
  run: number;
  invariant: Invariant;
  detail: string;
};

export function check(results: RunResult[]): Violation[] {
  return results.flatMap((r) => (r.error === null ? checkRun(r) : []));
}

function checkRun(r: RunResult): Violation[] {
  const violations: Violation[] = [];
  const fail = (invariant: Invariant, detail: string) =>
    violations.push({ prompt: r.prompt, run: r.run, invariant, detail });

  // Rule 1: every id is a candidate, or a pin the person already had.
  const allowed = new Set([...r.candidateIds, ...r.pins.map((p) => p.id)]);
  for (const item of r.items) {
    if (!allowed.has(item.id)) {
      fail("candidate_set", `${item.id} is not in the candidate set`);
    }
  }

  // Rule 2: every pin survives with its kind, and a position pin keeps its index.
  for (const pin of r.pins) {
    const index = r.items.findIndex((i) => i.id === pin.id);
    if (index === -1) fail("pins_intact", `pin ${pin.id} is gone`);
    else if (r.items[index].pinned !== pin.pinned) {
      fail(
        "pins_intact",
        `pin ${pin.id} is ${r.items[index].pinned}, was ${pin.pinned}`,
      );
    } else if (pin.pinned === "position" && index !== pin.index) {
      fail(
        "pins_intact",
        `pin ${pin.id} moved from track ${pin.index + 1} to ${index + 1}`,
      );
    }
  }

  const unknown = r.items.filter((i) => i.durationS === null);
  const total = r.items.reduce((s, i) => s + (i.durationS ?? 0), 0);
  if (r.targetS === null) {
    fail("duration_in_range", "no target length");
  } else if (unknown.length > 0) {
    fail("duration_in_range", `${unknown.length} items have no duration`);
  } else if (Math.abs(total - r.targetS) > r.targetS * DURATION_TOLERANCE) {
    fail(
      "duration_in_range",
      `${minutes(total)} against a target of ${minutes(r.targetS)}`,
    );
  }

  const perArtist = new Map<number, { name: string; count: number }>();
  for (const artist of r.items.flatMap((i) => i.artists)) {
    const seen = perArtist.get(artist.id) ?? { name: artist.name, count: 0 };
    perArtist.set(artist.id, { ...seen, count: seen.count + 1 });
  }
  for (const { name, count } of perArtist.values()) {
    if (count > ARTIST_CAP)
      fail("artist_cap", `${name} appears ${count} times`);
  }
  return violations;
}

const minutes = (s: number) => `${Math.round(s / 60)} min`;

export type Summary = {
  runs: number;
  errors: { prompt: number; run: number; error: string }[];
  violations: Violation[];
  latencyMs: { p50: number; p90: number; max: number };
  tokens: { in: number; out: number };
  droppedIds: number;
  // Candidates retrieval returned, fewest and median; zero means an empty catalog.
  candidates: { min: number; p50: number };
};

export function summarize(results: RunResult[]): Summary {
  const latencies = sorted(results.map((r) => r.latencyMs));
  const candidates = sorted(results.map((r) => r.candidateIds.length));
  return {
    runs: results.length,
    errors: results.flatMap((r) =>
      r.error === null
        ? []
        : [{ prompt: r.prompt, run: r.run, error: r.error }],
    ),
    violations: check(results),
    latencyMs: {
      p50: at(latencies, 0.5),
      p90: at(latencies, 0.9),
      max: latencies.at(-1) ?? 0,
    },
    tokens: {
      in: results.reduce((s, r) => s + r.tokensIn, 0),
      out: results.reduce((s, r) => s + r.tokensOut, 0),
    },
    droppedIds: results.reduce((s, r) => s + r.droppedIds.length, 0),
    candidates: { min: candidates[0] ?? 0, p50: at(candidates, 0.5) },
  };
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const at = (xs: number[], q: number) =>
  xs.length === 0
    ? 0
    : xs[Math.min(xs.length - 1, Math.ceil(q * xs.length) - 1)];

export const passed = (s: Summary) =>
  s.runs > 0 && s.errors.length === 0 && s.violations.length === 0;

const INVARIANTS: [Invariant, string][] = [
  ["candidate_set", "Every id from the candidate set or a pin"],
  ["pins_intact", "Pins intact"],
  ["duration_in_range", "Length within ±10% of the target"],
  ["artist_cap", `At most ${ARTIST_CAP} per artist`],
];

// Markdown for the terminal and the Actions job summary.
export function report(s: Summary): string {
  const lines = [
    `### Evals: ${passed(s) ? "pass" : "fail"}`,
    "",
    `${s.runs} runs, ${s.errors.length} failed to finish. p50 ${s.latencyMs.p50} ms, p90 ${s.latencyMs.p90} ms, max ${s.latencyMs.max} ms. ${s.tokens.in} tokens in, ${s.tokens.out} out. Candidates per run: fewest ${s.candidates.min}, median ${s.candidates.p50}. Repair dropped ${s.droppedIds} invented ids.`,
    "",
    "| Invariant | Violations |",
    "| --- | --- |",
    ...INVARIANTS.map(
      ([key, label]) =>
        `| ${label} | ${s.violations.filter((v) => v.invariant === key).length} |`,
    ),
  ];
  const detail = [
    ...s.errors.map((e) => `- Prompt ${e.prompt}, run ${e.run}: ${e.error}`),
    ...s.violations.map(
      (v) => `- Prompt ${v.prompt}, run ${v.run}, ${v.invariant}: ${v.detail}`,
    ),
  ];
  if (detail.length > 0) lines.push("", ...detail);
  return lines.join("\n") + "\n";
}
