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

// What repair needs about an item already in the list that retrieval may not have
// returned (a pin, a kept item): it still counts toward the artist cap and the
// duration. Duration is null once the item's cache row has expired (architecture 5.3).
export type ListItemFacts = {
  id: PerformanceId;
  artistIds: ArtistId[];
  durationS: number | null;
};

// One entry per id, in the order of `ids`, eligible or not.
export type ListItemFactsById = (
  ids: PerformanceId[],
) => Promise<ListItemFacts[]>;

// Three alternatives; no model call, never gated.
export type ReplaceOptions = (
  input: ReplaceInput,
) => Promise<PerformanceCard[]>;

// Display data for the editor, one card per id in the order of `ids`, including
// performances whose cache row has expired.
export type PerformanceCards = (
  ids: PerformanceId[],
) => Promise<PerformanceCard[]>;

// The catalog the brief step matches a request against (architecture 6.2 step 1).
export type BriefCatalogContext = {
  publishers: { id: number; name: string }[];
  series: {
    id: number;
    publisher_id: number;
    name: string;
    convention: string;
  }[];
  // An exact name or alias match, ignoring case; null when there is none.
  artistIdFor: (name: string) => Promise<ArtistId | null>;
};

export type BriefContext = () => Promise<BriefCatalogContext>;
