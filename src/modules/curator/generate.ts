// generate (architecture 6.2 steps 1 to 4): brief, retrieval, compose, then
// validate and repair in code. It returns a proposed revision; playlist writes it
// (step 5). A failed model call ends the run with the draft untouched: playlist
// sends `generation_failed` and writes only the curator_run row.
import type { Brief, CuratorProposal, PerformanceId } from "@/contracts";
import type { PerformanceCards, RetrieveCandidates } from "@/modules/catalog";
import { type BriefContext, extractBrief } from "./brief";
import { type PinnedSlot, compose } from "./compose";
import type { CallRecord, LlmAdapter } from "./llm";
import type { CuratorOutcome, Generate } from "./types";
import { type PinFacts, repair } from "./validate";

export type GenerateDeps = {
  llm: Pick<LlmAdapter, "extractBrief" | "compose">;
  // Publishers, series and the exact artist lookup the brief step matches against.
  briefContext: () => Promise<BriefContext>;
  retrieveCandidates: RetrieveCandidates;
  performanceCards: PerformanceCards;
  now?: () => number;
};

export function createGenerate(deps: GenerateDeps): Generate {
  const now = deps.now ?? Date.now;
  return async (state, { emit, signal }) => {
    const started = now();
    const calls: CallRecord[] = [];
    const run = (
      facts: Partial<CuratorProposal["run"]> = {},
    ): CuratorProposal["run"] => ({
      candidateIds: [],
      outputIds: [],
      droppedIds: [],
      // The main model's, once compose has run.
      model:
        (calls.findLast((c) => c.fn === "compose") ?? calls.at(-1))?.model ??
        "none",
      tokensIn: calls.reduce((sum, c) => sum + c.tokensIn, 0),
      tokensOut: calls.reduce((sum, c) => sum + c.tokensOut, 0),
      latencyMs: Math.max(0, Math.round(now() - started)),
      ...facts,
    });
    const failed = (
      error: "schema" | "timeout" | "provider",
      facts?: Partial<CuratorProposal["run"]>,
    ): CuratorOutcome => ({ ok: false, error, run: run(facts) });

    let brief = state.brief;
    if (state.input) {
      const result = await extractBrief(
        state.input,
        await deps.briefContext(),
        {
          llm: deps.llm,
          signal,
        },
      );
      calls.push(...result.calls);
      if (!result.ok) return failed(result.error);
      brief = state.brief
        ? keepExclusions(result.output, state.brief)
        : result.output;
    }
    if (!brief) throw new Error("generate needs an input or a held brief");
    emit({ type: "brief", brief, echo: echo(brief) });

    const candidates = await deps.retrieveCandidates(brief, {
      listIds: state.items.map((i) => i.performance_id),
      removedIds: state.removedIds,
      earlierIds: state.earlierIds,
    });
    const candidateIds = candidates.map((c) => c.row.id);
    emit({ type: "candidates", count: candidates.length });

    const pinned = state.items.filter((i) => i.pinned !== "none");
    const cards = await deps.performanceCards(
      pinned.map((i) => i.performance_id),
    );
    const pins = new Map<PerformanceId, PinFacts>(
      cards.map((c) => [c.id, { artists: c.artists, durationS: c.durationS }]),
    );
    const slots: PinnedSlot[] = state.items.flatMap((item, index) =>
      item.pinned === "none"
        ? []
        : [
            {
              id: item.performance_id,
              index,
              pinned: item.pinned,
              artist:
                pins
                  .get(item.performance_id)
                  ?.artists.map((a) => a.name)
                  .join(" & ") ?? "?",
              duration_s: pins.get(item.performance_id)?.durationS ?? null,
            },
          ],
    );

    const composed = await compose(
      { brief, candidates: candidates.map((c) => c.row), pins: slots },
      { llm: deps.llm, signal },
    );
    calls.push(...composed.calls);
    if (!composed.ok) return failed(composed.error, { candidateIds });

    const repaired = repair({
      composed: composed.output.ids,
      candidates,
      items: state.items,
      pins,
      removedIds: state.removedIds,
      brief,
      instruction: state.input?.text ?? null,
    });
    return {
      ok: true,
      proposal: {
        trigger: "generate",
        items: repaired.items,
        removedIds: repaired.removedIds,
        brief,
        title: composed.output.title,
        description: composed.output.arc,
        warnings: repaired.warnings,
        run: run({
          candidateIds,
          outputIds: composed.output.ids,
          droppedIds: repaired.droppedIds,
        }),
      },
    };
  };
}

// Exclusions survive every run (CLAUDE.md rule 2): the new brief keeps the held
// brief's excluded artists, publishers and series. A series the new input names
// as a source lifts its own exclusion, as a refine does (brief/index.ts).
export function keepExclusions(next: Brief, held: Brief): Brief {
  const union = (a: number[], b: number[]) => [...new Set([...a, ...b])];
  return {
    ...next,
    series_exclude: union(
      held.series_exclude.filter((id) => !next.series_include.includes(id)),
      next.series_exclude,
    ),
    exclusions: {
      artist_ids: union(held.exclusions.artist_ids, next.exclusions.artist_ids),
      publisher_ids: union(
        held.exclusions.publisher_ids,
        next.exclusions.publisher_ids,
      ),
    },
  };
}

const ENERGY_WORD = ["", "hushed", "mellow", "easy", "upbeat", "loud"];

// The brief read back in a few words ("2 hours · starts mellow, ends upbeat"),
// so the person can catch a misread (architecture 6.2 step 1).
export function echo(brief: Brief): string {
  const minutes = Math.round(brief.duration_s / 60);
  const length =
    minutes % 60 !== 0
      ? `${minutes} min`
      : minutes === 60
        ? "1 hour"
        : `${minutes / 60} hours`;
  const first = brief.curve[0].energy;
  const last = brief.curve.at(-1)!.energy;
  const arc =
    first === last
      ? `${ENERGY_WORD[first]} throughout`
      : `starts ${ENERGY_WORD[first]}, ends ${ENERGY_WORD[last]}`;
  return `${length} · ${arc}`;
}
