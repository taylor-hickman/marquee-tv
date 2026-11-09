import type {
  Brief,
  BriefInput,
  CuratorProposal,
  DraftId,
  PerformanceId,
  RevisionItem,
  StreamEvent,
} from "@/contracts";

// What playlist hands the curator. The curator reads the catalog through its
// index and never touches Postgres (architecture 3).
export type CuratorState = {
  draftId: DraftId;
  // New input from the person; null on regenerate, or when the brief held on the draft is used.
  input: BriefInput | null;
  // The current revision's brief; null before the first run.
  brief: Brief | null;
  items: RevisionItem[];
  removedIds: PerformanceId[];
  // Every performance in an earlier revision, for `prefer_unfamiliar`.
  earlierIds: PerformanceId[];
};

export type RunOptions = {
  // The progress events the curator produces; playlist sends `started` and `result`.
  emit: (event: Extract<StreamEvent, { type: "brief" | "candidates" }>) => void;
  // Aborted at the 20 s ceiling, which the caller sets.
  signal: AbortSignal;
};

// A failed run still records a curator_run row, so it carries the run facts so far.
export type CuratorOutcome =
  | { ok: true; proposal: CuratorProposal }
  | {
      ok: false;
      error: "schema" | "timeout" | "provider";
      run: CuratorProposal["run"];
    };

export type Generate = (
  state: CuratorState,
  options: RunOptions,
) => Promise<CuratorOutcome>;

// Ops against the current list; an unpin or remove on a pin only when `instruction`
// names that artist (architecture 6.3).
export type Refine = (
  state: CuratorState,
  instruction: string,
  options: RunOptions,
) => Promise<CuratorOutcome>;

// Pins fixed; brief extraction skipped unless the brief changed.
export type Regenerate = (
  state: CuratorState,
  options: RunOptions,
) => Promise<CuratorOutcome>;

// Manual picks become inclusion pins the composer may place (J4).
export type Fill = (
  state: CuratorState,
  options: RunOptions,
) => Promise<CuratorOutcome>;
