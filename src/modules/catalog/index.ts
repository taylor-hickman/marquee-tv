// Publishers, series, artists, performances and profiles; search and candidate
// retrieval (architecture 3). Lane A fills these in.
import { notImplemented } from "@/contracts";
import type {
  ArtistTypeahead,
  ListItemFactsById,
  PerformanceCards,
  ReplaceOptions,
  RetrieveCandidates,
  Search,
} from "./types";

export type * from "./types";

export const search: Search = () => notImplemented("catalog.search");
export const artistTypeahead: ArtistTypeahead = () =>
  notImplemented("catalog.artistTypeahead");
export const retrieveCandidates: RetrieveCandidates = () =>
  notImplemented("catalog.retrieveCandidates");
export const listItemFacts: ListItemFactsById = () =>
  notImplemented("catalog.listItemFacts");
export const replaceOptions: ReplaceOptions = () =>
  notImplemented("catalog.replaceOptions");
export const performanceCards: PerformanceCards = () =>
  notImplemented("catalog.performanceCards");
