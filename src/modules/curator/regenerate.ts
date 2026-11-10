// Regenerate unpinned (architecture 6.3): generate's pipeline on the draft's
// brief with every pin fixed where it is. The brief step runs only when the
// person changed the brief, which playlist signals by passing `input`.
import type { PerformanceId } from "@/contracts";
import { type GenerateDeps, createGenerate } from "./generate";
import type { Regenerate } from "./types";

export function createRegenerate(deps: GenerateDeps): Regenerate {
  const generate = createGenerate(deps);
  return async (state, options) => {
    // An include pin holds its index for this run and keeps its include mark,
    // so the composer may still place it on a later fill.
    const include = new Set<PerformanceId>(
      state.items
        .filter((i) => i.pinned === "include")
        .map((i) => i.performance_id),
    );
    const outcome = await generate(
      {
        ...state,
        items: state.items.map((i) =>
          include.has(i.performance_id) ? { ...i, pinned: "position" } : i,
        ),
      },
      options,
    );
    if (!outcome.ok) return outcome;
    return {
      ok: true,
      proposal: {
        ...outcome.proposal,
        trigger: "regenerate",
        items: outcome.proposal.items.map((i) =>
          include.has(i.performance_id) ? { ...i, pinned: "include" } : i,
        ),
      },
    };
  };
}
