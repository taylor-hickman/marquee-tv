import type {
  ArtistId,
  Brief,
  CandidateRow,
  CatalogArtistsResponse,
  CatalogSearchRequest,
  CatalogSearchResponse,
  PerformanceCard,
  PerformanceId,
  RevisionItem,
} from "@/contracts";

// A retrieved candidate: the row the compose call sees, plus what repair checks
// in code (the two-per-artist cap, excluded series and publishers).
export type Candidate = {
  row: CandidateRow;
  artistIds: ArtistId[];
  seriesId: number;
  publisherId: number;
};

// The draft's state as retrieval needs it (architecture 6.2 step 2).
export type RetrievalState = {
  // In the current revision.
  listIds: PerformanceId[];
  removedIds: PerformanceId[];
  // In any earlier revision of this draft, for `novelty = prefer_unfamiliar`.
  earlierIds: PerformanceId[];
};

// Replace one (architecture 6.3): the slot at `index` in `items`.
export type ReplaceInput = {
  items: RevisionItem[];
  removedIds: PerformanceId[];
  brief: Brief | null;
  index: number;
};

export type Search = (
  query: CatalogSearchRequest,
) => Promise<CatalogSearchResponse>;

export type ArtistTypeahead = (
  prefix: string,
) => Promise<CatalogArtistsResponse["artists"]>;

// Seeds, then similar artists, then profile matches; eligible and available only;
// at most 150.
export type RetrieveCandidates = (
  brief: Brief,
  state: RetrievalState,
) => Promise<Candidate[]>;

// Candidate rows for given ids, eligible or not: pins and kept items that retrieval
// did not return still count toward duration and the artist cap.
export type CandidatesById = (ids: PerformanceId[]) => Promise<Candidate[]>;

// Three alternatives; no model call, never gated.
export type ReplaceOptions = (
  input: ReplaceInput,
) => Promise<PerformanceCard[]>;

// Display data for the editor, in the order of `ids`.
export type PerformanceCards = (
  ids: PerformanceId[],
) => Promise<PerformanceCard[]>;
