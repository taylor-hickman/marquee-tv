import { describe, expect, test } from "vitest";
import { briefInput } from "@/contracts";
import { addSeed, options, toBriefSeeds, type Seed } from "./seeds";

const khruangbin = { id: 1, name: "Khruangbin", eligibleCount: 2 };
const hiatus = { id: 2, name: "Hiatus Kaiyote", eligibleCount: 3 };
const shame = { id: 3, name: "Shame", eligibleCount: 0, closest: [hiatus] };

const add = (...artists: (typeof khruangbin)[]) =>
  artists.reduce<Seed[]>(
    (seeds, artist) => addSeed(seeds, { kind: "catalog", artist }),
    [],
  );

const brief = (seeds: Seed[]) =>
  briefInput.parse({ text: "", durationS: 7200, seeds: toBriefSeeds(seeds) })
    .seeds;

describe("seeds", () => {
  test("a catalog artist with something to play is must-include by default", () => {
    expect(brief(add(khruangbin, hiatus))).toEqual([
      { artistId: 1, name: "Khruangbin", mustInclude: true },
      { artistId: 2, name: "Hiatus Kaiyote", mustInclude: true },
    ]);
  });

  test("a name outside the catalog is a reference only", () => {
    const seeds = addSeed([], { kind: "influence", name: " Radiohead " });
    expect(brief(seeds)).toEqual([{ name: "Radiohead", mustInclude: false }]);
  });

  test("an artist with nothing to play is never must-include, and keeps its closest artists", () => {
    const seeds = add(shame);
    expect(seeds[0]).toMatchObject({ kind: "catalog", closest: [hiatus] });
    const forced = seeds.map((s) => ({ ...s, mustInclude: true }));
    expect(brief(forced)).toEqual([
      { artistId: 3, name: "Shame", mustInclude: false },
    ]);
  });

  test("adding a seed twice keeps one", () => {
    expect(add(khruangbin, khruangbin)).toHaveLength(1);
    const once = addSeed([], { kind: "influence", name: "Radiohead" });
    expect(addSeed(once, { kind: "influence", name: "radiohead" })).toBe(once);
  });
});

describe("options", () => {
  test("offers the typed name as a reference when no artist has that name", () => {
    expect(options("Radio", [khruangbin], [])).toEqual([
      { kind: "catalog", artist: khruangbin },
      { kind: "influence", name: "Radio" },
    ]);
  });

  test("offers no reference when an artist has exactly that name", () => {
    expect(options(" khruangbin ", [khruangbin], [])).toEqual([
      { kind: "catalog", artist: khruangbin },
    ]);
  });

  test("leaves out what is already a seed", () => {
    const seeds = addSeed(add(khruangbin), {
      kind: "influence",
      name: "Hiatus",
    });
    expect(options("hiatus", [khruangbin, hiatus], seeds)).toEqual([
      { kind: "catalog", artist: hiatus },
    ]);
  });
});
