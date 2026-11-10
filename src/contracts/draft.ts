import { z } from "zod";
import { brief } from "./brief";
import {
  draftId,
  performanceCard,
  performanceId,
  revisionNumber,
} from "./common";

// One entry of playlist_revision.items (architecture 5.2). `position` pins are
// placed by the person and locked; `include` pins are manual picks the curator may place.
export const revisionItem = z.object({
  performance_id: performanceId,
  pinned: z.enum(["none", "include", "position"]),
  source: z.enum(["ai", "manual", "seed"]),
});
export type RevisionItem = z.infer<typeof revisionItem>;

export const revisionTrigger = z.enum([
  "generate",
  "refine",
  "edit",
  "undo",
  "regenerate",
]);

export const revision = z.object({
  number: revisionNumber,
  items: z.array(revisionItem),
  removedIds: z.array(performanceId),
  brief: brief.nullable(),
  trigger: revisionTrigger,
  instruction: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Revision = z.infer<typeof revision>;

// Edit operations (architecture 6.3). Manual edits send any of them to POST /ops;
// refine's compose call returns only add, remove, replace and move (`curatorOp`).
// Items are unique in a list, so a performance id names its row.
const addOp = z.object({
  op: z.literal("add"),
  performance_id: performanceId,
  // Omitted: append to the end.
  index: z.number().int().nonnegative().optional(),
});
const removeOp = z.object({
  op: z.literal("remove"),
  performance_id: performanceId,
});
const replaceOp = z.object({
  op: z.literal("replace"),
  performance_id: performanceId,
  with_performance_id: performanceId,
});
const moveOp = z.object({
  op: z.literal("move"),
  performance_id: performanceId,
  to_index: z.number().int().nonnegative(),
});
const pinOp = z.object({ op: z.literal("pin"), performance_id: performanceId });
const unpinOp = z.object({
  op: z.literal("unpin"),
  performance_id: performanceId,
});
const renameOp = z
  .object({
    op: z.literal("rename"),
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
  })
  .refine((o) => o.title !== undefined || o.description !== undefined, {
    message: "rename needs a title or a description",
  });

export const op = z.discriminatedUnion("op", [
  addOp,
  removeOp,
  replaceOp,
  moveOp,
  pinOp,
  unpinOp,
  renameOp,
]);
export type Op = z.infer<typeof op>;

export const curatorOp = z.discriminatedUnion("op", [
  addOp,
  removeOp,
  replaceOp,
  moveOp,
]);
export type CuratorOp = z.infer<typeof curatorOp>;

export const draftStatus = z.enum(["active", "awaiting_payment", "read_only"]);
export type DraftStatus = z.infer<typeof draftStatus>;

// Entry type, as `brief_submitted` records it (journeys 6).
export const creationMethod = z.enum(["typed", "chip", "artist", "manual"]);

// Whether the curator may run on this draft for this owner (architecture 7.3).
export const entitlementState = z.enum([
  "free",
  "pass",
  "subscription",
  "payment_required",
  "read_only",
]);
export type EntitlementState = z.infer<typeof entitlementState>;

// Values of app_flag.handoff_mode (architecture 7.2; T4 seeds `url`). `api`
// adds Save to my YouTube (architecture 11); only staging sets it until the
// quota extension is approved.
export const handoffMode = z.enum(["url", "copy_list", "api"]);

// GET /api/drafts/:id, and the body every draft write returns.
export const draftView = z.object({
  draft: z.object({
    id: draftId,
    title: z.string().nullable(),
    description: z.string().nullable(),
    status: draftStatus,
    free: z.boolean(),
    creationMethod,
    durationTargetS: z.number().int().positive().nullable(),
  }),
  revision: revision.nullable(),
  // Display data for every id in the revision's items.
  performances: z.array(performanceCard),
  flags: z.object({ handoffMode }),
  entitlement: z.object({
    state: entitlementState,
    // Model-backed runs left under the 25-per-draft cap (architecture 6.3).
    runsLeft: z.number().int().min(0).max(25),
  }),
});
export type DraftView = z.infer<typeof draftView>;
