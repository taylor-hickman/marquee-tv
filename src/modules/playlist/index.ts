// Drafts, revisions, edit operations, concurrency (architecture 3). Calls curator
// and billing through their indexes. Lane C fills these in.
import { notImplemented } from "@/contracts";
import type {
  ApplyOps,
  ClaimGuestDrafts,
  CreateDraft,
  CreateShareLink,
  GetDraft,
  ListLibrary,
  RecordHandoff,
  ReplaceOptions,
  ResolveShareLink,
  StartRun,
  Undo,
} from "./types";

export type * from "./types";

export const createDraft: CreateDraft = () =>
  notImplemented("playlist.createDraft");
export const getDraft: GetDraft = () => notImplemented("playlist.getDraft");
export const applyOps: ApplyOps = () => notImplemented("playlist.applyOps");
export const undo: Undo = () => notImplemented("playlist.undo");
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
