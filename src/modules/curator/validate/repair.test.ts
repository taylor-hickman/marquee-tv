import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Brief, RevisionItem } from "@/contracts";
import type { Candidate } from "@/modules/catalog";
import { type PinFacts, names, repair } from "./index";

const brief: Brief = {
  curve: [
    { from_min: 0, to_min: 30, energy: 2 },
    { from_min: 30, to_min: 90, energy: 4 },
  ],
  genres: [],
  scenes: [],
  seeds: [],
  influences: [],
  series_include: [],
  series_exclude: [],
  novelty: "default",
  surprise: false,
  exclusions: { artist_ids: [], publisher_ids: [] },
  duration_s: 5400,
};

function candidate(
  id: number,
  artist: number,
  durationS: number,
  energy: number,
): Candidate {
  return {
    row: {
      id,
      artist: `Artist ${artist}`,
      series: "S",
      duration_s: durationS,
      artist_energy: energy,
      genres: [],
    },
    artistIds: [artist],
    seriesId: 1,
    publisherId: 1,
  };
}

// Candidates from a small artist pool, so the cap bites, plus a reserve of
// one-off artists that is never removed or excluded, so pins can always be
// reached. Pins, removals and exclusions come from the pool.
const scenario = fc
  .record({
    pool: fc.array(
      fc.record({
        artist: fc.integer({ min: 1, max: 6 }),
        durationS: fc.integer({ min: 120, max: 1500 }),
        energy: fc.integer({ min: 1, max: 5 }),
      }),
      { minLength: 1, maxLength: 30 },
    ),
    listSize: fc.integer({ min: 0, max: 8 }),
    pinKinds: fc.array(fc.constantFrom("none", "include", "position"), {
      minLength: 8,
      maxLength: 8,
    }),
    removedPicks: fc.array(fc.nat(), { maxLength: 6 }),
    excludedArtists: fc.uniqueArray(fc.integer({ min: 1, max: 6 }), {
      maxLength: 2,
    }),
    composedPicks: fc.array(
      fc.oneof(
        fc.nat().map((n) => ({ pick: n })),
        fc.integer({ min: 9000, max: 9100 }).map((id) => ({ id })),
      ),
      { maxLength: 40 },
    ),
    durationS: fc.integer({ min: 600, max: 4 * 3600 }),
    instruction: fc.constantFrom(null, "drop Artist 3", "more Artist 2 please"),
    mustInclude: fc.uniqueArray(fc.integer({ min: 1, max: 8 }), {
      maxLength: 2,
    }),
  })
  .map((s) => {
    const pool = s.pool.map((c, i) =>
      candidate(i + 1, c.artist, c.durationS, c.energy),
    );
    const reserve = Array.from({ length: 10 }, (_, i) =>
      candidate(100 + i, 100 + i, 600, 3),
    );
    const candidates = [...pool, ...reserve];
    const listed = pool.slice(0, s.listSize);
    const items: RevisionItem[] = listed.map((c, i) => ({
      performance_id: c.row.id,
      pinned: s.pinKinds[i] as RevisionItem["pinned"],
      source: "manual",
    }));
    const pinIds = new Set(
      items.filter((i) => i.pinned !== "none").map((i) => i.performance_id),
    );
    const removedIds = [
      ...new Set(
        s.removedPicks
          .map((n) => pool[n % pool.length].row.id)
          .filter((id) => !pinIds.has(id)),
      ),
    ];
    const composed = s.composedPicks.map((p) =>
      "id" in p ? p.id : candidates[p.pick % candidates.length].row.id,
    );
    const pins = new Map<number, PinFacts>(
      listed.map((c) => [
        c.row.id,
        {
          artists: [{ id: c.artistIds[0], name: c.row.artist }],
          durationS: c.row.duration_s,
        },
      ]),
    );
    return {
      composed,
      candidates,
      items,
      pins,
      removedIds,
      brief: {
        ...brief,
        duration_s: s.durationS,
        exclusions: { artist_ids: s.excludedArtists, publisher_ids: [] },
        seeds: s.mustInclude.map((artist_id) => ({
          artist_id,
          must_include: true,
        })),
      },
      instruction: s.instruction,
    };
  });

describe("repair", () => {
  test("rule 1 and rule 2 hold for any composer output: candidate ids only, pins at their index, no removed id, two per artist", () => {
    fc.assert(
      fc.property(scenario, (input) => {
        const result = repair(input);
        const out = result.items.map((i) => i.performance_id);
        const candidateIds = new Set(input.candidates.map((c) => c.row.id));
        const artistOf = new Map(
          input.candidates.map((c) => [c.row.id, c.artistIds[0]]),
        );

        expect(out.every((id) => candidateIds.has(id))).toBe(true);
        expect(new Set(out).size).toBe(out.length);

        for (const [index, item] of input.items.entries()) {
          if (item.pinned === "none") continue;
          if (result.released.includes(item.performance_id)) {
            expect(out).not.toContain(item.performance_id);
            expect(result.removedIds).toContain(item.performance_id);
            continue;
          }
          if (item.pinned === "position")
            expect(out[index]).toBe(item.performance_id);
          else expect(out).toContain(item.performance_id);
        }

        for (const id of input.removedIds) expect(out).not.toContain(id);

        const pinnedPerArtist = new Map<number, number>();
        for (const item of input.items) {
          if (
            item.pinned === "none" ||
            result.released.includes(item.performance_id)
          )
            continue;
          const a = artistOf.get(item.performance_id)!;
          pinnedPerArtist.set(a, (pinnedPerArtist.get(a) ?? 0) + 1);
        }
        const perArtist = new Map<number, number>();
        for (const id of out)
          perArtist.set(
            artistOf.get(id)!,
            (perArtist.get(artistOf.get(id)!) ?? 0) + 1,
          );
        for (const [a, n] of perArtist)
          expect(n).toBeLessThanOrEqual(
            Math.max(2, pinnedPerArtist.get(a) ?? 0),
          );

        expect(result.droppedIds.every((id) => !candidateIds.has(id))).toBe(
          true,
        );
      }),
      { numRuns: 500 },
    );
  });

  test("excluded artists, publishers and series stay out unless pinned", () => {
    const candidates = [
      candidate(1, 1, 600, 3),
      { ...candidate(2, 2, 600, 3), publisherId: 7 },
      { ...candidate(3, 3, 600, 3), seriesId: 8 },
      candidate(4, 4, 600, 3),
    ];
    const result = repair({
      composed: [1, 2, 3, 4],
      candidates,
      items: [],
      pins: new Map(),
      removedIds: [],
      brief: {
        ...brief,
        duration_s: 1200,
        series_exclude: [8],
        exclusions: { artist_ids: [1], publisher_ids: [7] },
      },
      instruction: null,
    });
    expect(result.items.map((i) => i.performance_id)).toEqual([4]);
  });

  test("an include pin goes where the composer put it, or at the end when left out", () => {
    const candidates = [1, 2, 3, 4].map((id) => candidate(id, id, 600, 3));
    const pick = (id: number): RevisionItem => ({
      performance_id: id,
      pinned: "include",
      source: "manual",
    });
    const pins = new Map<number, PinFacts>([
      [3, { artists: [{ id: 3, name: "Artist 3" }], durationS: 600 }],
      [4, { artists: [{ id: 4, name: "Artist 4" }], durationS: null }],
    ]);
    const result = repair({
      composed: [3, 1, 3, 2],
      candidates,
      items: [pick(3), pick(4)],
      pins,
      removedIds: [],
      brief: { ...brief, duration_s: 1800 },
      instruction: null,
    });
    expect(result.items.map((i) => i.performance_id)).toEqual([3, 1, 2, 4]);
    expect(result.items[0]).toEqual(pick(3));
  });

  test("a pin with no facts is kept where it was", () => {
    const result = repair({
      composed: [1],
      candidates: [candidate(1, 1, 600, 3)],
      items: [{ performance_id: 50, pinned: "position", source: "manual" }],
      pins: new Map(),
      removedIds: [],
      brief: { ...brief, duration_s: 600 },
      instruction: "drop everything",
    });
    expect(result.items.map((i) => i.performance_id)).toEqual([50, 1]);
  });

  test("a pin past the end of a short list follows it", () => {
    const result = repair({
      composed: [],
      candidates: [],
      items: [1, 2, 3].map((id) => ({
        performance_id: id,
        pinned: id === 3 ? "position" : "none",
        source: "ai",
      })),
      pins: new Map([
        [3, { artists: [{ id: 3, name: "Artist 3" }], durationS: 600 }],
      ]),
      removedIds: [],
      brief: { ...brief, duration_s: 600 },
      instruction: null,
    });
    expect(result.items.map((i) => i.performance_id)).toEqual([3]);
  });
});

describe("names", () => {
  test.each([
    ["drop Khruangbin", "Khruangbin", true],
    ["no KHRUANGBIN at all", "Khruangbin", true],
    ["drop Khruangbins", "Khruangbin", false],
    ["no Sigur Rós", "Sigur Rós", true],
    ["no Tune-Yards (please)", "Tune-Yards", true],
    ["anything", "  ", false],
    [null, "Khruangbin", false],
  ])("%s / %s", (text, artist, expected) => {
    expect(names(text, artist)).toBe(expected);
  });
});
