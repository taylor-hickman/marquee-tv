import type {
  ApiResult,
  CreateDraftRequest,
  DraftId,
  DraftView,
  GenerateRequest,
  HandoffEvent,
  LibraryResponse,
  OpsRequest,
  Owner,
  RefineRequest,
  ReplaceOptionsResponse,
  ShareLinkRequest,
  ShareLinkResponse,
  StreamEvent,
  UndoRequest,
  UserId,
} from "@/contracts";

// Every write checks `baseRevision` and answers `conflict` with the current draft;
// a draft the owner does not hold is `not_found`; `read_only` blocks writes.

export type CreateDraft = (
  owner: Owner,
  body: CreateDraftRequest,
) => Promise<DraftView>;

export type GetDraft = (
  owner: Owner,
  draftId: DraftId,
) => Promise<ApiResult<DraftView>>;

export type ApplyOps = (
  owner: Owner,
  draftId: DraftId,
  body: OpsRequest,
) => Promise<ApiResult<DraftView>>;

export type Undo = (
  owner: Owner,
  draftId: DraftId,
  body: UndoRequest,
) => Promise<ApiResult<DraftView>>;

// Model-backed runs (C2). Checks, in order: owner, `baseRevision`, rate limit,
// entitlement, the 25-run cap. A refused run never opens the stream.
export type RunContext = {
  owner: Owner;
  ipHash: Uint8Array;
  now: Date;
  // 20 s in production; tests set milliseconds.
  ceilingMs: number;
};

export type RunRequest =
  | { kind: "generate"; body: GenerateRequest }
  | { kind: "refine"; body: RefineRequest };

// The run finishes and writes its revision even if the stream's reader goes away.
export type StartRun = (
  context: RunContext,
  draftId: DraftId,
  request: RunRequest,
) => Promise<ApiResult<ReadableStream<StreamEvent>>>;

export type ReplaceOptions = (
  owner: Owner,
  draftId: DraftId,
  index: number,
) => Promise<ApiResult<ReplaceOptionsResponse>>;

// Share links and handoff rows (C3).
export type CreateShareLink = (
  owner: Owner,
  draftId: DraftId,
  body: ShareLinkRequest,
) => Promise<ApiResult<ShareLinkResponse>>;

// What a code points at, with the revision's video ids in order, sliced from
// its start index; null when unknown.
export type SharedList = {
  draftId: DraftId;
  revision: number;
  startIndex: number;
  videoIds: string[];
};
export type ResolveShareLink = (code: string) => Promise<SharedList | null>;

export type RecordHandoff = (event: HandoffEvent) => Promise<void>;

// Library and claiming (C4).
export type ClaimGuestDrafts = (
  claimCode: string,
  userId: UserId,
) => Promise<{ claimed: number }>;

export type ListLibrary = (userId: UserId) => Promise<LibraryResponse>;
