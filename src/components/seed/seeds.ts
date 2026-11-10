import type { BriefInput, CatalogArtistsResponse } from "@/contracts";

// The seeds on the artist screen (PRD 7.2, J3). A catalog artist with
// something to play is must-include by default; a name outside the catalog,
// or an artist with nothing to play, can only be a reference.

export type TypeaheadArtist = CatalogArtistsResponse["artists"][number];

export type Seed =
  | {
      kind: "catalog";
      artistId: number;
      name: string;
      eligibleCount: number;
      closest: TypeaheadArtist[];
      mustInclude: boolean;
    }
  | { kind: "influence"; name: string };

export type Option =
  | { kind: "catalog"; artist: TypeaheadArtist }
  | { kind: "influence"; name: string };

const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export const seedKey = (seed: Seed) =>
  seed.kind === "catalog" ? `artist:${seed.artistId}` : `name:${seed.name}`;

export function canMustInclude(seed: Seed) {
  return seed.kind === "catalog" && seed.eligibleCount > 0;
}

function toSeed(option: Option): Seed {
  if (option.kind === "influence") {
    return { kind: "influence", name: option.name.trim() };
  }
  const { id, name, eligibleCount, closest = [] } = option.artist;
  return {
    kind: "catalog",
    artistId: id,
    name,
    eligibleCount,
    closest,
    mustInclude: eligibleCount > 0,
  };
}

function hasSeed(seeds: Seed[], option: Option) {
  return seeds.some((seed) =>
    option.kind === "catalog"
      ? seed.kind === "catalog" && seed.artistId === option.artist.id
      : same(seed.name, option.name),
  );
}

export function addSeed(seeds: Seed[], option: Option): Seed[] {
  return hasSeed(seeds, option) ? seeds : [...seeds, toSeed(option)];
}

// The typeahead's artists not yet chosen, then the typed name as a reference
// when no catalog artist has exactly that name.
export function options(
  query: string,
  artists: TypeaheadArtist[],
  seeds: Seed[],
): Option[] {
  const found: Option[] = artists.map((artist) => ({
    kind: "catalog",
    artist,
  }));
  const typed: Option = { kind: "influence", name: query.trim() };
  if (typed.name && !artists.some((a) => same(a.name, typed.name))) {
    found.push(typed);
  }
  return found.filter((option) => !hasSeed(seeds, option));
}

export function toBriefSeeds(seeds: Seed[]): BriefInput["seeds"] {
  return seeds.map((seed) =>
    seed.kind === "catalog"
      ? {
          artistId: seed.artistId,
          name: seed.name,
          mustInclude: canMustInclude(seed) && seed.mustInclude,
        }
      : { name: seed.name, mustInclude: false },
  );
}
