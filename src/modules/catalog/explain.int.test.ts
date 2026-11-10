import { sql } from "@/test/db";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { searchIdsQuery, typeaheadQuery } from "./search";

vi.mock("server-only", () => ({}));

// The 300 ms target (PRD 13) is measured on staging (I4). Here we check the
// mechanism: at launch scale the planner answers search from the full-text
// indexes and typeahead from the trigram indexes.
const PERFORMANCES = 5_000;
const ARTISTS = 2_500;

// Letters only, so each word is one token for the 'simple' parser.
const word = (seed: string) =>
  sql`translate(substr(md5(${seed} || g::text), 1, 8), '0123456789', 'ghijklmnop')`;

beforeAll(async () => {
  await sql`
    insert into artist (name, review_status)
    select initcap(${word("first")}) || ' ' || initcap(${word("last")}), 'accepted'
    from generate_series(1, ${ARTISTS} - (select count(*) from artist)) g`;
  await sql`
    insert into artist_alias (artist_id, alias)
    select id, 'The ' || name from artist
    on conflict do nothing`;
  await sql`
    insert into artist_profile (artist_id, energy, source)
    select id, 1 + id % 5, 'model' from artist
    on conflict do nothing`;
  await sql`
    with made as (
      insert into performance (video_id, series_id, eligible, kind, review_status)
      select substr(md5('v' || g::text), 1, 11), 1 + g % 6, true, 'performance', 'accepted'
      from generate_series(1, ${PERFORMANCES} - (select count(*) from performance)) g
      returning id
    ), billed as (
      insert into performance_artist (performance_id, artist_id, billing_order)
      select id, (select min(id) from artist) + id % ${ARTISTS}, 1 from made
      returning performance_id, artist_id
    )
    insert into performance_yt_cache (performance_id, title, duration_s, published_at, available)
    select b.performance_id, a.name || ': Live Session ' || b.performance_id,
      600 + b.performance_id % 1200, now() - make_interval(days => b.performance_id::int), true
    from billed b join artist a on a.id = b.artist_id`;
  // Autovacuum keeps live tables this way; the bulk insert leaves GIN pending lists.
  await sql`vacuum analyze`;
}, 60_000);

const plan = async (query: PromiseLike<unknown>) =>
  (await sql<{ "QUERY PLAN": string }[]>`explain ${query as never}`)
    .map((r) => r["QUERY PLAN"])
    .join("\n");

describe("at 5,000 performances", () => {
  test("the catalog is that size", async () => {
    const [counts] = await sql`
      select (select count(*) from performance)::int as performances,
             (select count(*) from performance_yt_cache)::int as cached`;
    expect(counts).toEqual({
      performances: PERFORMANCES,
      cached: PERFORMANCES,
    });
  });

  test("search uses the full-text indexes on titles and artist names", async () => {
    const explained = await plan(
      searchIdsQuery({ q: "khruangbin", offset: 0 }),
    );
    expect(explained).toContain("performance_yt_cache_title_fts_idx");
    expect(explained).toContain("artist_name_fts_idx");
  });

  test("typeahead uses the trigram indexes on names and aliases", async () => {
    const explained = await plan(typeaheadQuery("khru"));
    expect(explained).toContain("artist_name_trgm_idx");
    expect(explained).toContain("artist_alias_alias_trgm_idx");
  });
});
