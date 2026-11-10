// Publishers, series, artists, performances and profiles; search and candidate
// retrieval (architecture 3).
import type {
  ArtistTypeahead,
  BriefContext,
  ListItemFactsById,
  PerformanceCards,
  ReplaceOptions,
  RetrieveCandidates,
  Search,
} from "./types";
import * as brief from "./brief-context";
import * as cards from "./cards";
import * as retrieve from "./retrieve";
import * as searching from "./search";

export type * from "./types";

export const search: Search = searching.search;
export const artistTypeahead: ArtistTypeahead = searching.artistTypeahead;
export const retrieveCandidates: RetrieveCandidates =
  retrieve.retrieveCandidates;
export const listItemFacts: ListItemFactsById = retrieve.listItemFacts;
export const replaceOptions: ReplaceOptions = retrieve.replaceOptions;
export const performanceCards: PerformanceCards = cards.performanceCards;
export const briefContext: BriefContext = brief.briefContext;
