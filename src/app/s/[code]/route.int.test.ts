import { sql } from "@/test/db";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { shareRedirectResponse } from "@/contracts";
import { PLAIN_PER_IP_PER_MINUTE } from "@/lib/rate-limit";
import { catalogIds, draftAt } from "@/modules/playlist/testing";
import * as factories from "@/test/factories";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

let n = 0;
const open = (code: string, headers: Record<string, string> = {}) =>
  GET(
    new Request(`http://localhost/s/${code}`, {
      // Each test gets its own address, so the per-IP limit stays out of the way.
      headers: { "x-forwarded-for": `203.0.113.${++n}`, ...headers },
    }),
    { params: Promise.resolve({ code }) },
  );

const videoIds = async (performanceIds: number[]) => {
  const rows = await sql<{ id: number; video_id: string }[]>`
    select id, video_id from performance where id = any(${performanceIds})`;
  const byId = new Map(rows.map((r) => [r.id, r.video_id]));
  return performanceIds.map((id) => byId.get(id)!);
};

const queue = (response: Response) =>
  new URL(
    shareRedirectResponse.parse({ location: response.headers.get("location") })
      .location,
  ).searchParams
    .get("video_ids")!
    .split(",");

// The factory's default code has a hyphen, which no real code has.
const link = (o: Record<string, unknown>) =>
  factories.shareLink({
    code: crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    ...o,
  });

let ids: number[];

beforeAll(async () => {
  ids = await catalogIds(60);
});

describe("GET /s/:code", () => {
  // R1 (docs/architecture/handoff-tests.md): the 302 reached the YouTube app on
  // iOS and Android, so the share link redirects rather than showing a page.
  test("redirects with a 302 to the revision's queue from its start index", async () => {
    const draft = await draftAt(ids.slice(0, 5));
    const shared = await link({
      draft_id: draft,
      revision: 1,
      start_index: 2,
    });
    const response = await open(shared.code);
    expect(response.status).toBe(302);
    expect(queue(response)).toEqual(await videoIds(ids.slice(2, 5)));
  });

  test("a list over 50 sends the first part", async () => {
    const draft = await draftAt(ids);
    const shared = await link({ draft_id: draft, revision: 1 });
    expect(queue(await open(shared.code))).toEqual(
      await videoIds(ids.slice(0, 50)),
    );
  });

  test("logs share_link_opened against the draft", async () => {
    const draft = await draftAt(ids.slice(0, 3));
    const shared = await link({
      draft_id: draft,
      revision: 1,
      start_index: 1,
    });
    await open(shared.code);
    const rows = await sql`
      select * from event
      where name = 'share_link_opened' and draft_id = ${draft}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].props).toEqual({ revision: 1, startIndex: 1 });
  });

  test("an unknown or malformed code is not found", async () => {
    expect((await open("Zz9Zz9Zz")).status).toBe(404);
    expect((await open("../etc")).status).toBe(404);
  });

  test("a list whose performances are all gone is not found", async () => {
    const performance = await factories.performance();
    const draft = await draftAt([performance.id]);
    const shared = await link({ draft_id: draft, revision: 1 });
    await sql`delete from performance where id = ${performance.id}`;
    expect((await open(shared.code)).status).toBe(404);
  });

  test("limits one IP per minute", async () => {
    const draft = await draftAt(ids.slice(0, 2));
    const shared = await link({ draft_id: draft, revision: 1 });
    const headers = { "x-forwarded-for": "192.0.2.77" };
    for (let i = 0; i < PLAIN_PER_IP_PER_MINUTE; i++) {
      expect((await open(shared.code, headers)).status).toBe(302);
    }
    const response = await open(shared.code, headers);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
