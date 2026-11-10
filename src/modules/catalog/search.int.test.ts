import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { catalogSearchResponse, type CatalogSearchRequest } from "@/contracts";
import * as factories from "@/test/factories";
import { artistTypeahead, search } from ".";

vi.mock("server-only", () => ({}));

const find = (request: Partial<CatalogSearchRequest>) =>
  search({ offset: 0, ...request });

// Every page of a search, as ids.
async function all(request: Partial<CatalogSearchRequest>) {
  const found: number[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await find({ ...request, offset });
    found.push(...page.performances.map((p) => p.id));
    offset = page.nextOffset;
  }
  return found;
}

const playableIds = async (where = sql``) =>
  (
    await sql<{ id: number }[]>`
      select p.id from performance p
      join performance_yt_cache c on c.performance_id = p.id
      join series s on s.id = p.series_id
      where p.eligible and c.available
        and p.review_status not in ('flagged', 'rejected')
        and not exists (select 1 from performance_artist pa
          join artist a on a.id = pa.artist_id
          where pa.performance_id = p.id and a.review_status in ('flagged', 'rejected'))
        ${where}`
  ).map((r) => r.id);

describe("search", () => {
  test("browses every playable performance a page at a time, newest first", async () => {
    const first = await find({});
    expect(catalogSearchResponse.parse(first)).toEqual(first);
    expect(first.performances).toHaveLength(30);
    expect(first.nextOffset).toBe(30);
    const dates = first.performances.map((p) => p.publishedAt!);
    expect(dates).toEqual([...dates].sort().reverse());

    const found = await all({});
    expect(new Set(found).size).toBe(found.length);
    expect(found.sort()).toEqual((await playableIds()).sort());
  });

  test("matches artist names by word prefix", async () => {
    const [khruangbin] = await sql<{ id: number }[]>`
      select id from artist where name = 'Khruangbin'`;
    const theirs = await playableIds(
      sql`and exists (select 1 from performance_artist pa
        where pa.performance_id = p.id and pa.artist_id = ${khruangbin.id})`,
    );
    expect(theirs.length).toBeGreaterThan(0);
    expect((await all({ q: "khruang" })).sort()).toEqual(theirs.sort());
    expect((await all({ q: "KHRUANGBIN" })).sort()).toEqual(theirs.sort());
  });

  test("matches titles", async () => {
    const page = await find({ q: "colors encore" });
    expect(page.performances.length).toBeGreaterThan(0);
    for (const p of page.performances) {
      expect(p.title).toMatch(/A COLORS ENCORE/);
    }
  });

  test("filters by publisher, series and artist", async () => {
    for (const p of (await find({ publisherId: 2 })).performances) {
      expect(p.publisher.id).toBe(2);
    }
    for (const p of (await find({ seriesId: 5 })).performances) {
      expect(p.series.id).toBe(5);
    }
    const artistId = (await find({})).performances[0].artists[0].id;
    const theirs = await find({ artistId });
    expect(theirs.performances.length).toBeGreaterThan(0);
    for (const p of theirs.performances) {
      expect(p.artists.map((a) => a.id)).toContain(artistId);
    }
    expect((await all({ q: "tiny desk", publisherId: 2 })).length).toBe(0);
  });

  test("leaves out performances that are not eligible or not available", async () => {
    const hidden = await sql<{ id: number }[]>`
      select p.id from performance p
      join performance_yt_cache c on c.performance_id = p.id
      where not (p.eligible and c.available)`;
    expect(hidden.length).toBeGreaterThan(0);
    const found = await all({});
    for (const { id } of hidden) expect(found).not.toContain(id);
  });

  test("leaves out flagged and rejected performances and those billing a flagged or rejected artist", async () => {
    const make = async (review_status: string, artistStatus = "pending") => {
      const p = await factories.performance({
        eligible: true,
        review_status,
        series_id: 1,
      });
      const a = await factories.artist({ review_status: artistStatus });
      await factories.performanceArtist({
        performance_id: p.id,
        artist_id: a.id,
      });
      await factories.performanceYtCache({
        performance_id: p.id,
        title: `Vwqk Live Session ${p.id}`,
      });
      return p.id as number;
    };
    const held = [
      await make("flagged"),
      await make("rejected"),
      await make("accepted", "flagged"),
      await make("pending", "rejected"),
    ];
    const cleared = [await make("pending"), await make("accepted", "accepted")];

    expect((await all({ q: "vwqk" })).sort()).toEqual(cleared.sort());
    const browsed = await all({});
    for (const id of held) expect(browsed).not.toContain(id);
    for (const id of cleared) expect(browsed).toContain(id);
  });

  test("treats a query with no words as browse", async () => {
    expect(await find({ q: "&!:*" })).toEqual(await find({}));
  });
});

describe("artistTypeahead", () => {
  test("finds names by any part, prefix matches first, with what they can play", async () => {
    const inside = await factories.artist({ name: "The Qzxv Band" });
    const start = await factories.artist({ name: "Qzxv" });
    const p = await factories.performance({ eligible: true, series_id: 1 });
    await factories.performanceArtist({
      performance_id: p.id,
      artist_id: inside.id,
    });
    await factories.performanceYtCache({ performance_id: p.id });

    expect(await artistTypeahead("qzx")).toEqual([
      { id: start.id, name: "Qzxv", eligibleCount: 0 },
      { id: inside.id, name: "The Qzxv Band", eligibleCount: 1 },
    ]);
  });

  test("finds an artist by an alias", async () => {
    const [aliased] = await sql<{ id: number; name: string; alias: string }[]>`
      select a.id, a.name, al.alias from artist a
      join artist_alias al on al.artist_id = a.id
      where a.name not ilike '%' || al.alias || '%'
      limit 1`;
    const found = await artistTypeahead(aliased.alias);
    expect(found.map((a) => a.id)).toContain(aliased.id);
    expect(
      found.find((a) => a.id === aliased.id)!.eligibleCount,
    ).toBeGreaterThan(0);
  });

  test("hides flagged and rejected artists and counts only cleared performances", async () => {
    const pending = await factories.artist({ name: "Kvwq Pending" });
    await factories.artist({ name: "Kvwq Flagged", review_status: "flagged" });
    await factories.artist({
      name: "Kvwq Rejected",
      review_status: "rejected",
    });
    const flaggedAlias = await factories.artist({
      name: "Someone Else",
      review_status: "flagged",
    });
    await factories.artistAlias({
      artist_id: flaggedAlias.id,
      alias: "Kvwq Alias",
    });
    const rejectedGuest = await factories.artist({ review_status: "rejected" });
    const make = async (review_status: string, guest?: number) => {
      const p = await factories.performance({
        eligible: true,
        review_status,
        series_id: 1,
      });
      await factories.performanceArtist({
        performance_id: p.id,
        artist_id: pending.id,
      });
      if (guest)
        await factories.performanceArtist({
          performance_id: p.id,
          artist_id: guest,
          billing_order: 2,
        });
      await factories.performanceYtCache({ performance_id: p.id });
    };
    await make("pending");
    await make("accepted");
    await make("flagged");
    await make("rejected");
    await make("accepted", rejectedGuest.id);

    expect(await artistTypeahead("kvwq")).toEqual([
      { id: pending.id, name: "Kvwq Pending", eligibleCount: 2 },
    ]);
  });

  test("reads % and _ as text", async () => {
    await factories.artist({ name: "100% Qzxv" });
    expect((await artistTypeahead("%")).map((a) => a.name)).toEqual([
      "100% Qzxv",
    ]);
    expect(await artistTypeahead("_")).toEqual([]);
  });
});
