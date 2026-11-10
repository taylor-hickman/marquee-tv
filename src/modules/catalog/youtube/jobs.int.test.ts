import { databaseUrl, sql } from "@/test/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as factories from "@/test/factories";
import { FIXTURE_PLAYLIST, stubYouTube } from "./fixtures";
import { createYouTube, expire, ingestNew, refresh } from ".";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllGlobals());
// video_id is unique, and the tests in this file share a database.
beforeEach(() => sql`delete from performance where video_id like 'A2fixture%'`);

const DAY = 86_400_000;
const now = new Date("2026-11-10T03:00:00Z");

// The fixture channel's two series, sharing one uploads playlist.
async function fixtureSeries() {
  const publisher = await factories.publisher();
  const desk = await factories.series({
    publisher_id: publisher.id,
    uploads_playlist_id: FIXTURE_PLAYLIST,
    title_rule: "{artist}: Tiny Desk Concert",
  });
  const home = await factories.series({
    publisher_id: publisher.id,
    uploads_playlist_id: FIXTURE_PLAYLIST,
    title_rule: "{artist}: Tiny Desk (Home) Concert",
  });
  return { desk, home, ids: [desk.id, home.id] };
}

function api(snapshot: "now" | "later") {
  const requests = stubYouTube(snapshot);
  const calls = (method: string) =>
    requests.filter((u) => u.pathname.endsWith(`/${method}`));
  return { calls, youtube: createYouTube("test-key") };
}

const rows = (seriesIds: number[]) => sql`
  select p.video_id, p.series_id, p.review_status, p.eligible, p.last_verified_at,
         c.title, c.duration_s, c.published_at, c.available, c.fetched_at
  from performance p
  left join performance_yt_cache c on c.performance_id = p.id
  where p.series_id in ${sql(seriesIds)}
  order by p.video_id`;

describe("ingest:new", () => {
  test("pages the whole playlist on the first run and writes a pending row and cache row per upload in a series", async () => {
    const { desk, home, ids } = await fixtureSeries();
    const { calls, youtube } = api("now");

    expect(await ingestNew(youtube, now, ids)).toEqual({ written: 6 });

    // 02 is in neither series and 05 is private. 06 hasn't aired, so it has a
    // performance row but no cache row yet.
    expect(await rows(ids)).toEqual([
      expect.objectContaining({
        video_id: "A2fixture01",
        series_id: desk.id,
        title: "Ada Fixture: Tiny Desk Concert",
        duration_s: 1110,
        available: true,
      }),
      expect.objectContaining({
        video_id: "A2fixture03",
        series_id: home.id,
        duration_s: 1320,
        available: true,
      }),
      expect.objectContaining({ video_id: "A2fixture04", available: false }),
      expect.objectContaining({
        video_id: "A2fixture06",
        series_id: desk.id,
        title: null,
        fetched_at: null,
      }),
      expect.objectContaining({ video_id: "A2fixture07", duration_s: 3723 }),
      expect.objectContaining({ video_id: "A2fixture08", available: true }),
    ]);
    for (const row of await rows(ids)) {
      expect(row).toMatchObject({
        review_status: "pending",
        eligible: false,
        last_verified_at: now,
      });
    }
    expect((await rows(ids)).filter((r) => r.fetched_at)).toHaveLength(5);
    expect(calls("playlistItems")).toHaveLength(3);
    expect(calls("videos")).toHaveLength(1);
    expect(youtube.units).toBe(4);
  });

  test("stops paging once every series has reached its own newest upload in the catalog", async () => {
    const { desk, home, ids } = await fixtureSeries();
    await factories.performance({
      series_id: home.id,
      video_id: "A2fixture03",
    });
    await factories.performance({
      series_id: desk.id,
      video_id: "A2fixture04",
    });
    const { calls, youtube } = api("now");

    expect(await ingestNew(youtube, now, ids)).toEqual({ written: 1 });

    expect((await rows(ids)).map((r) => r.video_id)).toEqual([
      "A2fixture01",
      "A2fixture03",
      "A2fixture04",
    ]);
    expect(
      calls("playlistItems").map((u) => u.searchParams.get("pageToken")),
    ).toEqual([null, "PAGE2"]);
    expect(calls("videos")[0].searchParams.get("id")).toBe(
      "A2fixture01,A2fixture02",
    );
  });

  test("a series whose newest upload is older than its sibling's still gets every upload above it", async () => {
    const { desk, home, ids } = await fixtureSeries();
    // Home was ingested more recently than desk: desk's 04 and 06 came after
    // desk's last run, below home's 03.
    await factories.performance({
      series_id: home.id,
      video_id: "A2fixture03",
    });
    await factories.performance({
      series_id: desk.id,
      video_id: "A2fixture07",
    });
    const { calls, youtube } = api("now");

    expect(await ingestNew(youtube, now, ids)).toEqual({ written: 3 });

    expect((await rows(ids)).map((r) => r.video_id)).toEqual([
      "A2fixture01",
      "A2fixture03",
      "A2fixture04",
      "A2fixture06",
      "A2fixture07",
    ]);
    expect(calls("playlistItems")).toHaveLength(3);
  });

  test("a series added to a playlist already ingested for its sibling is backfilled", async () => {
    const { desk, home, ids } = await fixtureSeries();
    await ingestNew(api("now").youtube, now, [desk.id]);
    expect((await rows(ids)).map((r) => r.video_id)).not.toContain(
      "A2fixture03",
    );
    const { calls, youtube } = api("now");

    expect(await ingestNew(youtube, now, ids)).toEqual({ written: 1 });

    expect(await rows([home.id])).toEqual([
      expect.objectContaining({ video_id: "A2fixture03", fetched_at: now }),
    ]);
    expect(calls("playlistItems")).toHaveLength(3);
  });

  test("a run with nothing new writes nothing", async () => {
    const { ids } = await fixtureSeries();
    await ingestNew(api("now").youtube, now, ids);
    const { calls, youtube } = api("now");

    expect(await ingestNew(youtube, now, ids)).toEqual({ written: 0 });
    expect(calls("playlistItems")).toHaveLength(1);
    expect(await rows(ids)).toHaveLength(6);
  });
});

describe("refresh", () => {
  test("rewrites cache rows, flips available and sets last_verified_at", async () => {
    const { ids } = await fixtureSeries();
    await ingestNew(api("now").youtube, now, ids);
    const later = new Date(now.getTime() + 7 * DAY);
    const { calls, youtube } = api("later");

    expect(await refresh(youtube, later, ids)).toEqual({
      checked: 6,
      available: 3,
      gone: 1,
      restored: 1,
    });

    const byId = Object.fromEntries(
      (await rows(ids)).map((r) => [r.video_id, r]),
    );
    // Went private.
    expect(byId.A2fixture01).toMatchObject({
      available: false,
      fetched_at: later,
      last_verified_at: later,
    });
    // Retitled.
    expect(byId.A2fixture03).toMatchObject({
      title: "Cleo Fixture: Tiny Desk (Home) Concert (Encore)",
      available: true,
      fetched_at: later,
    });
    // US block lifted.
    expect(byId.A2fixture04).toMatchObject({ available: true });
    // The premiere aired: its cache row arrives. It stays ineligible until A3
    // gives it a kind.
    expect(byId.A2fixture06).toMatchObject({
      title: "Fen Fixture: Tiny Desk Concert",
      duration_s: 1200,
      available: true,
      fetched_at: later,
      eligible: false,
    });
    // Deleted: unavailable, and its old fetched_at lets expire remove it.
    expect(byId.A2fixture07).toMatchObject({
      available: false,
      fetched_at: now,
      last_verified_at: now,
    });
    // No longer allowed in the US.
    expect(byId.A2fixture08).toMatchObject({ available: false });
    expect(calls("videos")).toHaveLength(1);
    expect(calls("playlistItems")).toHaveLength(0);
  });

  test("brings back an expired cache row and the performance's eligibility", async () => {
    const { desk, ids } = await fixtureSeries();
    const performance = await factories.performance({
      series_id: desk.id,
      video_id: "A2fixture09",
      kind: "performance",
      review_status: "accepted",
      eligible: false,
    });
    const interview = await factories.performance({
      series_id: desk.id,
      video_id: "A2fixture10",
      kind: "interview",
      review_status: "accepted",
      eligible: false,
    });

    expect(await refresh(api("later").youtube, now, ids)).toMatchObject({
      checked: 2,
      restored: 2,
    });

    const eligible = async (id: number) =>
      (await sql`select eligible from performance where id = ${id}`)[0]
        .eligible;
    expect(await eligible(performance.id)).toBe(true);
    expect(await eligible(interview.id)).toBe(false);
    expect(await rows(ids)).toEqual([
      expect.objectContaining({ video_id: "A2fixture09", fetched_at: now }),
      expect.objectContaining({ video_id: "A2fixture10", fetched_at: now }),
    ]);
  });
});

describe("expire", () => {
  async function cached(fetchedDaysAgo: number) {
    const performance = await factories.performance({
      kind: "performance",
      review_status: "accepted",
      eligible: true,
    });
    await factories.performanceYtCache({
      performance_id: performance.id,
      fetched_at: new Date(now.getTime() - fetchedDaysAgo * DAY),
    });
    return performance.id;
  }

  const state = async (id: number) => {
    const [row] = await sql`
      select p.eligible, c.performance_id is not null as cached
      from performance p
      left join performance_yt_cache c on c.performance_id = p.id
      where p.id = ${id}`;
    return row;
  };

  test("deletes cache rows past 30 days and makes their performances ineligible", async () => {
    const stale = await cached(31);
    const fresh = await cached(29);
    const [{ due }] = await sql`
      select count(*)::int as due from performance_yt_cache
      where fetched_at < ${new Date(now.getTime() - 30 * DAY)}`;

    expect(await expire(now)).toEqual({ expired: due });

    expect(await state(stale)).toEqual({ eligible: false, cached: false });
    expect(await state(fresh)).toEqual({ eligible: true, cached: true });
    const [{ left }] = await sql`
      select count(*)::int as left from performance_yt_cache
      where fetched_at < ${new Date(now.getTime() - 30 * DAY)}`;
    expect(left).toBe(0);
  });

  // The scheduled job runs `pnpm ingest expire` against each environment's
  // DATABASE_URL; here it runs against this test's database.
  test("pnpm ingest expire runs the job", async () => {
    const stale = await cached(40);

    const { stdout } = await promisify(execFile)(
      "pnpm",
      ["--silent", "ingest", "expire"],
      { env: { ...process.env, DATABASE_URL: databaseUrl } },
    );

    expect(stdout).toMatch(/^expired \d+ cache rows?\n$/);
    expect(await state(stale)).toEqual({ eligible: false, cached: false });
  }, 30_000);
});
