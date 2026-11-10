import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import {
  candidateRow,
  performanceCard,
  type Brief,
  type RevisionItem,
} from "@/contracts";
import * as factories from "@/test/factories";
import {
  listItemFacts,
  performanceCards,
  replaceOptions,
  retrieveCandidates,
  type RetrievalState,
} from ".";

vi.mock("server-only", () => ({}));

const brief = (o: Partial<Brief> = {}): Brief => ({
  curve: [{ from_min: 0, to_min: 120, energy: 3 }],
  genres: [],
  scenes: [],
  seeds: [],
  influences: [],
  series_include: [],
  series_exclude: [],
  novelty: "default",
  surprise: false,
  exclusions: { artist_ids: [], publisher_ids: [] },
  duration_s: 7200,
  ...o,
});
const noState: RetrievalState = { listIds: [], removedIds: [], earlierIds: [] };
const ids = (cs: { row: { id: number } }[]) => cs.map((c) => c.row.id);

const artistNamed = async (name: string) => {
  const [a] = await sql<{ id: number; similar: number[] }[]>`
    select a.id, p.similar_artist_ids as similar
    from artist a join artist_profile p on p.artist_id = a.id
    where a.name = ${name}`;
  return a;
};

// Playable fixture performances, with the lead artist's profile.
type Playable = {
  id: number;
  artistIds: number[];
  seriesId: number;
  publisherId: number;
  durationS: number;
  energy: number;
  genres: string[];
};
const playable = () => sql<Playable[]>`
  select p.id, p.series_id as "seriesId", s.publisher_id as "publisherId",
    c.duration_s as "durationS", lp.energy, lp.genres,
    (select array_agg(artist_id order by billing_order) from performance_artist
     where performance_id = p.id) as "artistIds"
  from performance p
  join performance_yt_cache c on c.performance_id = p.id
  join series s on s.id = p.series_id
  join performance_artist lead on lead.performance_id = p.id and lead.billing_order = 1
  join artist_profile lp on lp.artist_id = lead.artist_id
  where p.eligible and c.available
    and p.review_status not in ('flagged', 'rejected')
    and not exists (select 1 from performance_artist pa
      join artist a on a.id = pa.artist_id
      where pa.performance_id = p.id and a.review_status in ('flagged', 'rejected'))
  order by p.id`;
const by = (rows: Playable[], artists: number[]) =>
  rows
    .filter((r) => r.artistIds.some((a) => artists.includes(a)))
    .map((r) => r.id);

// Eligible, available performances by one profiled lead artist, one for each
// way review can hold a performance back and one for each it lets through.
// Durations are equal and unusual so replace ranks them all first.
async function reviewCases(durationS: number) {
  const lead = await factories.artist();
  await factories.artistProfile({ artist_id: lead.id, energy: 3 });
  const make = async (
    review_status: string,
    lead_id: number,
    second?: string,
  ) => {
    const p = await factories.performance({
      eligible: true,
      kind: "performance",
      review_status,
      series_id: 1,
    });
    await factories.performanceArtist({
      performance_id: p.id,
      artist_id: lead_id,
    });
    if (second) {
      const a = await factories.artist({ review_status: second });
      await factories.performanceArtist({
        performance_id: p.id,
        artist_id: a.id,
        billing_order: 2,
      });
    }
    await factories.performanceYtCache({
      performance_id: p.id,
      duration_s: durationS,
    });
    return p.id as number;
  };
  const heldLead = async (review_status: string) => {
    const a = await factories.artist({ review_status });
    await factories.artistProfile({ artist_id: a.id, energy: 3 });
    return a.id as number;
  };
  const flaggedLead = await heldLead("flagged");
  const rejectedLead = await heldLead("rejected");
  // Held rows first, so without the filter they'd win replace's id tie-break.
  const held = [
    await make("flagged", lead.id),
    await make("rejected", lead.id),
    await make("accepted", lead.id, "flagged"),
    await make("pending", lead.id, "rejected"),
    await make("accepted", flaggedLead),
    await make("pending", rejectedLead),
  ];
  const cleared = [
    await make("pending", lead.id),
    await make("accepted", lead.id, "pending"),
  ];
  return {
    lead: lead.id as number,
    heldLeads: [flaggedLead, rejectedLead],
    held,
    cleared,
  };
}

describe("retrieveCandidates", () => {
  test("orders seeds, then similar artists, then profile matches in the energy range", async () => {
    const khruangbin = await artistNamed("Khruangbin");
    const all = await playable();
    const candidates = await retrieveCandidates(
      brief({
        seeds: [{ artist_id: khruangbin.id, must_include: true }],
        genres: ["Funk"],
        curve: [
          { from_min: 0, to_min: 60, energy: 2 },
          { from_min: 60, to_min: 120, energy: 4 },
        ],
      }),
      noState,
    );
    const got = ids(candidates);

    const seeds = by(all, [khruangbin.id]);
    const similar = by(all, khruangbin.similar).filter(
      (id) => !seeds.includes(id),
    );
    const matches = all
      .filter(
        (r) =>
          r.energy >= 2 &&
          r.energy <= 4 &&
          r.genres.includes("funk") &&
          !seeds.includes(r.id) &&
          !similar.includes(r.id),
      )
      .map((r) => r.id);
    expect(seeds.length).toBeGreaterThan(0);
    expect(similar.length).toBeGreaterThan(0);
    expect(matches.length).toBeGreaterThan(0);

    const tier2End = seeds.length + similar.length;
    expect(got.slice(0, seeds.length).sort()).toEqual([...seeds].sort());
    expect(got.slice(seeds.length, tier2End).sort()).toEqual(
      [...similar].sort(),
    );
    expect(got.slice(tier2End).sort()).toEqual([...matches].sort());
  });

  test("rule 5: candidate rows carry ids, names and profiles, never titles", async () => {
    const khruangbin = await artistNamed("Khruangbin");
    const candidates = await retrieveCandidates(
      brief({ seeds: [{ artist_id: khruangbin.id, must_include: true }] }),
      noState,
    );
    for (const c of candidates) {
      expect(candidateRow.strict().parse(c.row)).toEqual(c.row);
    }
    const [first] = candidates;
    expect(first.row.artist).toBe("Khruangbin");
    expect(first.artistIds).toEqual([khruangbin.id]);
  });

  test("matches an influence's genres and scenes", async () => {
    const all = await playable();
    const candidates = await retrieveCandidates(
      brief({
        curve: [
          { from_min: 0, to_min: 120, energy: 1 },
          { from_min: 120, to_min: 180, energy: 5 },
        ],
        influences: [
          {
            name: "Not In Catalog",
            genres: ["desert blues"],
            scenes: [],
            energy: 3,
          },
        ],
      }),
      noState,
    );
    const expected = all
      .filter((r) => r.genres.includes("desert blues"))
      .map((r) => r.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(ids(candidates).sort()).toEqual(expected.sort());
  });

  test("caps at 150 with the seeds kept", async () => {
    const khruangbin = await artistNamed("Khruangbin");
    const all = await playable();
    expect(all.length).toBeGreaterThan(150);
    const candidates = await retrieveCandidates(
      brief({
        seeds: [{ artist_id: khruangbin.id, must_include: true }],
        curve: [
          { from_min: 0, to_min: 60, energy: 1 },
          { from_min: 60, to_min: 120, energy: 5 },
        ],
      }),
      noState,
    );
    expect(candidates).toHaveLength(150);
    const seeds = by(all, [khruangbin.id]);
    expect(ids(candidates).slice(0, seeds.length).sort()).toEqual(seeds.sort());
  });

  test("returns only eligible, available, cached performances", async () => {
    const artist = await factories.artist();
    await factories.artistProfile({ artist_id: artist.id });
    const make = async (
      eligible: boolean,
      cache: { available: boolean } | null,
    ) => {
      const p = await factories.performance({ eligible, series_id: 1 });
      await factories.performanceArtist({
        performance_id: p.id,
        artist_id: artist.id,
      });
      if (cache)
        await factories.performanceYtCache({ performance_id: p.id, ...cache });
      return p.id;
    };
    const good = await make(true, { available: true });
    await make(false, { available: true });
    await make(true, { available: false });
    await make(true, null);

    const candidates = await retrieveCandidates(
      brief({ seeds: [{ artist_id: artist.id, must_include: true }] }),
      noState,
    );
    expect(ids(candidates).filter((id) => id >= good)).toEqual([good]);
  });

  test("rule 5: flagged and rejected performances and artists never become candidates", async () => {
    const { lead, heldLeads, held, cleared } = await reviewCases(7777);
    const candidates = await retrieveCandidates(
      brief({
        seeds: [lead, ...heldLeads].map((artist_id) => ({
          artist_id,
          must_include: true,
        })),
      }),
      noState,
    );
    for (const id of held) expect(ids(candidates)).not.toContain(id);
    for (const id of cleared) expect(ids(candidates)).toContain(id);
  });

  test("rule 2: removed ids and excluded artists, publishers and series never come back", async () => {
    const khruangbin = await artistNamed("Khruangbin");
    const all = await playable();
    const seeds = by(all, [khruangbin.id]);
    const [excludedArtist] = khruangbin.similar;
    const base = brief({
      seeds: [{ artist_id: khruangbin.id, must_include: true }],
      curve: [
        { from_min: 0, to_min: 60, energy: 1 },
        { from_min: 60, to_min: 120, energy: 5 },
      ],
    });

    const removed = await retrieveCandidates(base, {
      ...noState,
      removedIds: [seeds[0]],
    });
    expect(ids(removed)).not.toContain(seeds[0]);
    for (const id of seeds.slice(1)) expect(ids(removed)).toContain(id);

    const excluded = await retrieveCandidates(
      {
        ...base,
        series_exclude: [1],
        exclusions: { artist_ids: [excludedArtist], publisher_ids: [2] },
      },
      noState,
    );
    expect(excluded.length).toBeGreaterThan(0);
    for (const c of excluded) {
      expect(c.artistIds).not.toContain(excludedArtist);
      expect(c.publisherId).not.toBe(2);
      expect(c.seriesId).not.toBe(1);
    }

    const included = await retrieveCandidates(
      { ...base, series_include: [3, 5] },
      noState,
    );
    expect(included.length).toBeGreaterThan(0);
    expect(new Set(included.map((c) => c.seriesId))).toEqual(new Set([3, 5]));
  });

  test("excludes a performance whose second-billed artist is excluded", async () => {
    const [shared] = (await playable()).filter((r) => r.artistIds.length > 1);
    const [lead, second] = shared.artistIds;
    const seeded = brief({ seeds: [{ artist_id: lead, must_include: true }] });
    expect(ids(await retrieveCandidates(seeded, noState))).toContain(shared.id);
    const candidates = await retrieveCandidates(
      { ...seeded, exclusions: { artist_ids: [second], publisher_ids: [] } },
      noState,
    );
    expect(ids(candidates)).not.toContain(shared.id);
  });

  test("prefer_unfamiliar moves seeds and earlier artists to the back", async () => {
    const khruangbin = await artistNamed("Khruangbin");
    const all = await playable();
    const [earlierArtist] = khruangbin.similar;
    const familiar = by(all, [khruangbin.id, earlierArtist]);
    const base = brief({
      seeds: [{ artist_id: khruangbin.id, must_include: true }],
      genres: ["funk", "soul"],
    });
    const state = { ...noState, earlierIds: [by(all, [earlierArtist])[0]] };

    const usual = await retrieveCandidates(base, state);
    const unfamiliar = await retrieveCandidates(
      { ...base, novelty: "prefer_unfamiliar" },
      state,
    );
    expect(ids(unfamiliar).sort()).toEqual(ids(usual).sort());
    const back = ids(unfamiliar).slice(-familiar.length);
    expect(back.sort()).toEqual([...familiar].sort());
  });

  test("surprise widens the genre match and stays in the energy range", async () => {
    const all = await playable();
    const jazzAt3 = all
      .filter((r) => r.energy === 3 && r.genres.includes("jazz"))
      .map((r) => r.id);
    const at3 = all.filter((r) => r.energy === 3).map((r) => r.id);
    expect(jazzAt3.length).toBeGreaterThan(0);
    expect(at3.length).toBeGreaterThan(jazzAt3.length);
    expect(at3.length).toBeLessThan(150);

    const usual = await retrieveCandidates(
      brief({ genres: ["jazz"] }),
      noState,
    );
    expect(ids(usual).sort()).toEqual([...jazzAt3].sort());

    const surprise = await retrieveCandidates(
      brief({ genres: ["jazz"], surprise: true }),
      noState,
    );
    expect(ids(surprise).sort()).toEqual([...at3].sort());
    expect(ids(surprise).slice(0, jazzAt3.length).sort()).toEqual(
      [...jazzAt3].sort(),
    );
  });
});

describe("listItemFacts", () => {
  test("gives artists in billing order and a null duration once the cache is gone", async () => {
    const [shared] = (await playable()).filter((r) => r.artistIds.length > 1);
    const expired = await factories.performance({ series_id: 1 });
    const artist = await factories.artist();
    await factories.performanceArtist({
      performance_id: expired.id,
      artist_id: artist.id,
    });

    expect(await listItemFacts([expired.id, shared.id, 999_999])).toEqual([
      { id: expired.id, artistIds: [artist.id], durationS: null },
      {
        id: shared.id,
        artistIds: shared.artistIds,
        durationS: shared.durationS,
      },
      { id: 999_999, artistIds: [], durationS: null },
    ]);
  });
});

describe("performanceCards", () => {
  test("keeps the order of ids and nulls YouTube fields once the cache is gone", async () => {
    const [a, b] = await playable();
    const expired = await factories.performance({ series_id: 1 });
    const artist = await factories.artist({ name: "Expired Artist" });
    await factories.performanceArtist({
      performance_id: expired.id,
      artist_id: artist.id,
    });

    const cards = await performanceCards([b.id, expired.id, a.id, 999_999]);
    expect(cards.map((c) => c.id)).toEqual([b.id, expired.id, a.id]);
    for (const card of cards) expect(performanceCard.parse(card)).toEqual(card);
    expect(cards[1]).toMatchObject({
      title: null,
      durationS: null,
      publishedAt: null,
      artists: [{ id: artist.id, name: "Expired Artist" }],
      series: { id: 1, name: "Tiny Desk Concerts" },
      publisher: { id: 1, name: "NPR Music" },
    });
    expect(cards[0].title).toEqual(expect.any(String));
    expect(cards[0].durationS).toBe(b.durationS);
  });
});

describe("replaceOptions", () => {
  const listOf = (rows: Playable[]): RevisionItem[] =>
    rows.map((r) => ({ performance_id: r.id, pinned: "none", source: "ai" }));

  test("offers three outside the list, energy within 1 of the slot and duration within 30%", async () => {
    const all = await playable();
    const list = all.slice(0, 6);
    const items = listOf(list);
    const removedIds = [all[10].id, all[11].id];
    const startMin = list.slice(0, 3).reduce((s, r) => s + r.durationS, 0) / 60;
    // The slot starts in the second segment, far from the first's energy.
    const curve = [
      { from_min: 0, to_min: startMin, energy: 1 },
      { from_min: startMin, to_min: 600, energy: 5 },
    ];

    const options = await replaceOptions({
      items,
      removedIds,
      brief: brief({ curve }),
      index: 3,
    });
    expect(options).toHaveLength(3);
    const byId = new Map(all.map((r) => [r.id, r]));
    for (const option of options) {
      expect(items.map((i) => i.performance_id)).not.toContain(option.id);
      expect(removedIds).not.toContain(option.id);
      expect(byId.get(option.id)!.energy).toBeGreaterThanOrEqual(4);
      expect(option.durationS!).toBeGreaterThanOrEqual(list[3].durationS * 0.7);
      expect(option.durationS!).toBeLessThanOrEqual(list[3].durationS * 1.3);
    }
  });

  test("matches the item's own artist energy on a hand-built list", async () => {
    const all = await playable();
    const list = all.slice(0, 4);
    const options = await replaceOptions({
      items: listOf(list),
      removedIds: [],
      brief: null,
      index: 1,
    });
    expect(options).toHaveLength(3);
    const byId = new Map(all.map((r) => [r.id, r]));
    for (const option of options) {
      expect(
        Math.abs(byId.get(option.id)!.energy - list[1].energy),
      ).toBeLessThanOrEqual(1);
    }
  });

  test("rule 5: never offers a flagged or rejected performance or artist", async () => {
    const { lead, held, cleared } = await reviewCases(7333);
    const item = await factories.performance({ eligible: true, series_id: 1 });
    await factories.performanceArtist({
      performance_id: item.id,
      artist_id: lead,
    });
    await factories.performanceYtCache({
      performance_id: item.id,
      duration_s: 7333,
    });
    const options = await replaceOptions({
      items: [{ performance_id: item.id, pinned: "none", source: "ai" }],
      removedIds: [],
      brief: null,
      index: 0,
    });
    const offered = options.map((o) => o.id);
    for (const id of held) expect(offered).not.toContain(id);
    for (const id of cleared) expect(offered).toContain(id);
  });

  test("drops a removed option on the next ask", async () => {
    const all = await playable();
    const items = listOf(all.slice(0, 4));
    const input = { items, removedIds: [], brief: brief(), index: 0 };
    const [first] = await replaceOptions(input);
    const again = await replaceOptions({ ...input, removedIds: [first.id] });
    expect(again).toHaveLength(3);
    expect(again.map((o) => o.id)).not.toContain(first.id);
  });

  test("returns nothing for an index past the list", async () => {
    expect(
      await replaceOptions({
        items: [],
        removedIds: [],
        brief: null,
        index: 0,
      }),
    ).toEqual([]);
  });
});
