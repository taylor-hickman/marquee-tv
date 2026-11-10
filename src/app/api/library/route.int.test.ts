import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { libraryResponse } from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import { catalogIds, draftAt } from "@/modules/playlist/testing";
import * as factories from "@/test/factories";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const get = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/library", { headers }));

describe("GET /api/library", () => {
  test("lists the user's drafts with title, runtime, status and last revision time", async () => {
    const user = await asUser();
    const ids = await catalogIds(3);
    const set = await draftAt(ids, {
      owner_user_id: user.userId,
      title: "Slow burn",
      free: true,
    });
    await sql`update playlist_revision set created_at = '2026-11-01T20:00:00Z'
              where draft_id = ${set}`;
    // One cached duration expired: it counts as zero.
    await sql`delete from performance_yt_cache where performance_id = ${ids[2]}`;
    const empty = await factories.playlistDraft({
      owner_user_id: user.userId,
      status: "awaiting_payment",
      updated_at: new Date("2026-11-05T12:00:00Z"),
    });
    await draftAt(await catalogIds(1));

    const response = await get(user.headers);
    expect(response.status).toBe(200);
    const body = libraryResponse.parse(await response.json());

    const performances = await sql<{ video_id: string; duration_s: number }[]>`
      select p.video_id, coalesce(c.duration_s, 0) as duration_s
      from unnest(${ids}::bigint[]) with ordinality u(id, ord)
      join performance p on p.id = u.id
      left join performance_yt_cache c on c.performance_id = p.id
      order by u.ord`;
    expect(body.drafts).toEqual([
      {
        id: empty.id,
        title: null,
        status: "awaiting_payment",
        free: false,
        revision: null,
        runtimeS: 0,
        videoIds: [],
        updatedAt: "2026-11-05T12:00:00.000Z",
      },
      {
        id: set,
        title: "Slow burn",
        status: "active",
        free: true,
        revision: 1,
        runtimeS: performances.reduce((sum, p) => sum + p.duration_s, 0),
        videoIds: performances.map((p) => p.video_id),
        updatedAt: "2026-11-01T20:00:00.000Z",
      },
    ]);
    expect(body.drafts[1].runtimeS).toBeGreaterThan(0);
  });

  test("a guest or a request without credentials is unauthorized", async () => {
    const guest = await asGuest();
    await factories.playlistDraft({ owner_guest_id: guest.guestId });
    expect((await get(guest.headers)).status).toBe(401);
    expect((await get()).status).toBe(401);
  });
});
