// Drafts, revisions, edit operations, concurrency (architecture 3). Calls curator
// and billing through their indexes. Lane C fills these in.
import { notImplemented } from "@/contracts";
import type {
  ClaimGuestDrafts,
  ListLibrary,
  ReplaceOptions,
  StartRun,
} from "./types";

export type * from "./types";

export { applyOps, authorize, createDraft, getDraft, undo } from "./drafts";
export { createShareLink, recordHandoff, resolveShareLink } from "./handoff";
export { fail, readBody, respond } from "./http";
export const startRun: StartRun = () => notImplemented("playlist.startRun");
export const replaceOptions: ReplaceOptions = () =>
  notImplemented("playlist.replaceOptions");
export const claimGuestDrafts: ClaimGuestDrafts = () =>
  notImplemented("playlist.claimGuestDrafts");
export const listLibrary: ListLibrary = () =>
  notImplemented("playlist.listLibrary");
