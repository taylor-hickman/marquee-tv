// Drafts, revisions, edit operations, concurrency (architecture 3). Calls curator
// and billing through their indexes. Lane C fills these in.
import { notImplemented } from "@/contracts";
import type {
  ClaimGuestDrafts,
  CreateShareLink,
  ListLibrary,
  RecordHandoff,
  ReplaceOptions,
  ResolveShareLink,
  StartRun,
} from "./types";

export type * from "./types";

export { applyOps, authorize, createDraft, getDraft, undo } from "./drafts";
export { fail, readBody, respond } from "./http";
export const startRun: StartRun = () => notImplemented("playlist.startRun");
export const replaceOptions: ReplaceOptions = () =>
  notImplemented("playlist.replaceOptions");
export const createShareLink: CreateShareLink = () =>
  notImplemented("playlist.createShareLink");
export const resolveShareLink: ResolveShareLink = () =>
  notImplemented("playlist.resolveShareLink");
export const recordHandoff: RecordHandoff = () =>
  notImplemented("playlist.recordHandoff");
export const claimGuestDrafts: ClaimGuestDrafts = () =>
  notImplemented("playlist.claimGuestDrafts");
export const listLibrary: ListLibrary = () =>
  notImplemented("playlist.listLibrary");
