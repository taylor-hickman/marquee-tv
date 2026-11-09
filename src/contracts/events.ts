import { z } from "zod";
import { draftId, revisionNumber } from "./common";

// The journey events (journeys 6). Nothing else is accepted.
export const eventName = z.enum([
  "landing_viewed",
  "brief_submitted",
  "generation_completed",
  "generation_failed",
  "item_pinned",
  "item_removed",
  "item_replaced",
  "item_moved",
  "refinement_applied",
  "refinement_undone",
  "regenerated_all",
  "handoff_opened",
  "handoff_copied",
  "handoff_shared",
  "share_link_opened",
  "paywall_viewed",
  "plan_selected",
  "signin_completed",
  "payment_completed",
  "payment_failed",
  "library_replayed",
]);
export type EventName = z.infer<typeof eventName>;

const handoffNames = [
  "handoff_opened",
  "handoff_copied",
  "handoff_shared",
] as const;

// Handoff events also become handoff_event rows, so they carry what that row needs
// (architecture 5.2): which list was sent, which part, and from which track.
export const handoffEvent = z.object({
  name: z.enum(handoffNames),
  draftId,
  revision: revisionNumber,
  part: z.number().int().positive(),
  startIndex: z.number().int().nonnegative(),
  surface: z.string().max(64).optional(),
});
export type HandoffEvent = z.infer<typeof handoffEvent>;

export const analyticsEvent = z.object({
  name: eventName.exclude(handoffNames),
  draftId: draftId.optional(),
  props: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .optional(),
});
