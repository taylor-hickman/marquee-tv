import { z } from "zod";
import { brief } from "./brief";
import { artistId, energy, performanceId } from "./common";
import { curatorOp, revisionItem, revisionTrigger } from "./draft";

// One candidate as the compose call sees it (architecture 6.2 step 3). Titles and
// descriptions are left out on purpose (CLAUDE.md rule 5).
export const candidateRow = z.object({
  id: performanceId,
  artist: z.string().min(1),
  series: z.string().min(1),
  duration_s: z.number().int().positive(),
  artist_energy: energy,
  genres: z.array(z.string().min(1)),
});
export type CandidateRow = z.infer<typeof candidateRow>;

// Compose call output for generate, regenerate and fill (6.2 step 3).
export const composeOutput = z.object({
  ids: z.array(performanceId).min(1),
  title: z.string().min(1).max(120),
  arc: z.string().min(1).max(200),
});
export type ComposeOutput = z.infer<typeof composeOutput>;

// Compose call output for refine: operations against the current list (6.3).
export const refineOutput = z.object({
  ops: z.array(curatorOp),
  title: z.string().min(1).max(120).optional(),
  arc: z.string().min(1).max(200).optional(),
});
export type RefineOutput = z.infer<typeof refineOutput>;

// Stored in curator_run.warnings and sent to the client with the result.
export const curatorWarning = z.discriminatedUnion("code", [
  // Repair could not bring the total within ±10% of the target (6.2 step 4).
  z.object({
    code: z.literal("duration_out_of_range"),
    target_s: z.number().int().positive(),
    actual_s: z.number().int().nonnegative(),
  }),
  // A must-include seed has no eligible performance.
  z.object({ code: z.literal("seed_unavailable"), artist_id: artistId }),
]);
export type CuratorWarning = z.infer<typeof curatorWarning>;

// What the curator hands playlist after validation and repair: a proposed revision
// and the facts for its curator_run row. Playlist writes both in one transaction.
export const curatorProposal = z.object({
  trigger: revisionTrigger.exclude(["edit", "undo"]),
  items: z.array(revisionItem),
  removedIds: z.array(performanceId),
  brief,
  title: z.string().min(1),
  // The one-line arc; becomes playlist_draft.description.
  description: z.string().min(1),
  warnings: z.array(curatorWarning),
  run: z.object({
    candidateIds: z.array(performanceId),
    outputIds: z.array(performanceId),
    // Ids the model returned that were not candidates, dropped in repair (rule 1).
    droppedIds: z.array(performanceId),
    model: z.string().min(1),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
  }),
});
export type CuratorProposal = z.infer<typeof curatorProposal>;
