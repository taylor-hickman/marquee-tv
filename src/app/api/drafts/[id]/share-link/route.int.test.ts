import { sql } from "@/test/db";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { shareLinkResponse } from "@/contracts";
import { asGuest } from "@/lib/auth/testing";
import { catalogIds, draftAt } from "@/modules/playlist/testing";
import * as factories from "@/test/factories";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const share = (id: string, body: unknown, headers: Record<string, string>) =>
  POST(
    new Request(`http://localhost/api/drafts/${id}/share-link`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

let ids: number[];
let guest: Awaited<ReturnType<typeof asGuest>>;

beforeAll(async () => {
  ids = await catalogIds(3);
  guest = await asGuest();
});

const codeOf = async (response: Response) =>
  shareLinkResponse.parse(await response.json()).code;

describe("POST /api/drafts/:id/share-link", () => {
  test("returns a short code and its getmarquee.tv link", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const response = await share(
      id,
      { baseRevision: 1, startIndex: 0 },
      guest.headers,
    );
    expect(response.status).toBe(200);
    const body = shareLinkResponse.parse(await response.json());
    expect(body.url).toBe(`https://getmarquee.tv/s/${body.code}`);
    const [row] = await sql`select * from share_link where code = ${body.code}`;
    expect(row).toMatchObject({ draft_id: id, revision: 1, start_index: 0 });
  });

  test("the same draft, revision and start index get the same code", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const body = { baseRevision: 1, startIndex: 1 };
    const [first, second] = await Promise.all([
      share(id, body, guest.headers).then(codeOf),
      share(id, body, guest.headers).then(codeOf),
    ]);
    expect(second).toBe(first);
    expect(await codeOf(await share(id, body, guest.headers))).toBe(first);
    const rows = await sql`select code from share_link where draft_id = ${id}`;
    expect(rows).toHaveLength(1);
  });

  test("a different start index or revision gets a different code", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const fromStart = await codeOf(
      await share(id, { baseRevision: 1, startIndex: 0 }, guest.headers),
    );
    const fromTwo = await codeOf(
      await share(id, { baseRevision: 1, startIndex: 2 }, guest.headers),
    );
    await factories.playlistRevision({
      draft_id: id,
      number: 2,
      items: sql.json([
        { performance_id: ids[0], pinned: "none", source: "ai" },
      ]),
    });
    await sql`update playlist_draft set current_revision = 2 where id = ${id}`;
    const revisionTwo = await codeOf(
      await share(id, { baseRevision: 2, startIndex: 0 }, guest.headers),
    );
    expect(new Set([fromStart, fromTwo, revisionTwo]).size).toBe(3);
  });

  test("a read-only draft can still be shared", async () => {
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      status: "read_only",
    });
    const response = await share(
      id,
      { baseRevision: 1, startIndex: 0 },
      guest.headers,
    );
    expect(response.status).toBe(200);
  });

  test("a stale baseRevision is a conflict with the current draft", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    await factories.playlistRevision({ draft_id: id, number: 2 });
    await sql`update playlist_draft set current_revision = 2 where id = ${id}`;
    const response = await share(
      id,
      { baseRevision: 1, startIndex: 0 },
      guest.headers,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "conflict",
      current: { revision: { number: 2 } },
    });
  });

  test("a start index past the last track is invalid", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const response = await share(
      id,
      { baseRevision: 1, startIndex: ids.length },
      guest.headers,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  test("a bad body is invalid", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const response = await share(
      id,
      { baseRevision: 1, startIndex: -1 },
      guest.headers,
    );
    expect(response.status).toBe(400);
  });

  test("someone else's draft is not found, and no credential is unauthorized", async () => {
    const id = await draftAt(ids);
    const body = { baseRevision: 1, startIndex: 0 };
    expect((await share(id, body, guest.headers)).status).toBe(404);
    expect((await share(id, body, {})).status).toBe(401);
  });
});
