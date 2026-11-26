// The eval runner (architecture 6.5):
//
//   pnpm evals [--runs N]      every prompt in docs/evals/prompts.md, N times,
//                              through curator.generate with the real model;
//                              writes evals/results/<date>.json, then checks it
//   pnpm evals --check FILE    checks a results file again, with no model calls
//
// Needs DATABASE_URL (the staging catalog) and ANTHROPIC_API_KEY. Exits 1 when
// a run fails to finish or an invariant is violated. With GITHUB_STEP_SUMMARY
// set, the report also goes to the Actions job summary.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { parseArgs } from "node:util";
import type { BriefInput, CuratorProposal, RevisionItem } from "@/contracts";
import { sql } from "@/lib/db";
import { briefContext, performanceCards } from "@/modules/catalog";
import { type CuratorState, generate } from "@/modules/curator";
import {
  type Results,
  type RunResult,
  passed,
  report,
  summarize,
} from "./check";
import { type EvalPrompt, parsePrompts } from "./prompts";

// The ceiling C2 sets on a run (architecture 6.2).
const CEILING_MS = 20_000;
// Runs in flight at once; keeps 500 runs inside an hour.
const CONCURRENCY = 4;

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "1" },
    check: { type: "string" },
  },
});

let results: Results;
let file: string;
if (values.check) {
  file = values.check;
  results = JSON.parse(readFileSync(file, "utf8"));
} else {
  if (process.env.LLM_ADAPTER === "fake") {
    throw new Error("Evals run the real model; unset LLM_ADAPTER");
  }
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error("--runs takes N ≥ 1");
  try {
    results = await runAll(runs);
  } finally {
    await sql.end();
  }
  file = `evals/results/${results.startedAt.slice(0, 10)}.json`;
  mkdirSync("evals/results", { recursive: true });
  writeFileSync(file, JSON.stringify(results, null, 2) + "\n");
}

const summary = summarize(results.results);
const text = report(summary);
console.log(`${file}\n\n${text}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
process.exitCode = passed(summary) ? 0 : 1;

async function runAll(runs: number): Promise<Results> {
  const startedAt = new Date().toISOString();
  const prompts = parsePrompts(readFileSync("docs/evals/prompts.md", "utf8"));
  const context = await briefContext();
  const jobs = prompts.flatMap((p) =>
    Array.from({ length: runs }, (_, i) => ({ prompt: p, run: i + 1 })),
  );
  const out: RunResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const input: BriefInput = {
          text: job.prompt.text,
          mood: job.prompt.mood,
          durationS: job.prompt.durationS,
          // A seed the catalog lacks is influence only, as the app sends it.
          seeds: await Promise.all(
            job.prompt.seeds.map(async (s) => {
              const artistId = await context.artistIdFor(s.name);
              return artistId === null
                ? { name: s.name, mustInclude: false as const }
                : { artistId, name: s.name, mustInclude: s.mustInclude };
            }),
          ),
        };
        const result = await runOne(job.prompt, job.run, input);
        out.push(result);
        console.log(
          `prompt ${result.prompt} run ${result.run}: ${result.error ?? "ok"}, ${result.latencyMs} ms`,
        );
      }
    }),
  );
  out.sort((a, b) => a.prompt - b.prompt || a.run - b.run);
  return { startedAt, commit: commit(), runs, results: out };
}

// A prompt with pins generates once, pins those tracks of the result, then
// generates again with the same input. The second run is the one recorded.
async function runOne(
  prompt: EvalPrompt,
  run: number,
  input: BriefInput,
): Promise<RunResult> {
  let state: CuratorState = {
    draftId: randomUUID(),
    input,
    brief: null,
    items: [],
    removedIds: [],
    earlierIds: [],
  };
  const base = { prompt: prompt.n, run, input, pins: [] as RunResult["pins"] };

  if (prompt.pins.length > 0) {
    const first = await generate(state, options());
    if (!first.ok) return failed(base, `first run: ${first.error}`, first.run);
    const items = first.proposal.items;
    const missing = prompt.pins.find((p) => p.index >= items.length);
    if (missing) {
      return failed(
        base,
        `first run has ${items.length} tracks, no track ${missing.index + 1} to pin`,
        first.proposal.run,
      );
    }
    const pinned: RevisionItem[] = items.map((item, index) => ({
      ...item,
      pinned: prompt.pins.find((p) => p.index === index)?.pinned ?? "none",
    }));
    state = {
      ...state,
      brief: first.proposal.brief,
      items: pinned,
      earlierIds: items.map((i) => i.performance_id),
    };
    base.pins = prompt.pins.map((p) => ({
      id: items[p.index].performance_id,
      pinned: p.pinned,
      index: p.index,
    }));
  }

  const outcome = await generate(state, options());
  if (!outcome.ok) return failed(base, outcome.error, outcome.run);
  const { proposal } = outcome;
  const cards = await performanceCards(
    proposal.items.map((i) => i.performance_id),
  );
  return {
    ...base,
    error: null,
    ...facts(proposal.run),
    targetS: proposal.brief.duration_s,
    candidateIds: proposal.run.candidateIds,
    droppedIds: proposal.run.droppedIds,
    items: proposal.items.map((item, i) => ({
      id: item.performance_id,
      pinned: item.pinned,
      artists: cards[i].artists,
      series: cards[i].series.name,
      durationS: cards[i].durationS,
    })),
    warnings: proposal.warnings,
    title: proposal.title,
    arc: proposal.description,
  };
}

function options() {
  return { emit: () => {}, signal: AbortSignal.timeout(CEILING_MS) };
}

function facts(run: CuratorProposal["run"]) {
  const { model, latencyMs, tokensIn, tokensOut } = run;
  return { model, latencyMs, tokensIn, tokensOut };
}

function failed(
  base: Pick<RunResult, "prompt" | "run" | "input" | "pins">,
  error: string,
  run: CuratorProposal["run"],
): RunResult {
  return {
    ...base,
    error,
    ...facts(run),
    targetS: null,
    candidateIds: run.candidateIds,
    droppedIds: run.droppedIds,
    items: [],
    warnings: [],
    title: null,
    arc: null,
  };
}

function commit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}
