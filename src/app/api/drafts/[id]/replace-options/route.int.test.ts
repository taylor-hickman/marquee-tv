import { sql } from "@/test/db";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { replaceOptionsResponse } from "@/contracts";
import { asGuest } from "@/lib/auth/testing";
import { catalogIds, draftAt } from "@/modules/playlist/testing";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const get = (id: string, query: string, headers: Record<string, string>) =>
  GET(
    new Request(`http://localhost/api/drafts/${id}/replace-options${query}`, {
      headers,
    }),
    { params: Promise.resolve({ id }) },
  );

let ids: number[];

beforeAll(async () => {
  ids = await catalogIds(3);
});

describe("GET /api/drafts/:id/replace-options", () => {
  test("rule 3: answers on a draft that would need payment to run the curator", async () => {
    const guest = await asGuest();
    await draftAt(ids, { owner_guest_id: guest.guestId, free: true });
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });

    const response = await get(id, "?index=1", guest.headers);
    expect(response.status).toBe(200);
    const { options } = replaceOptionsResponse.parse(await response.json());
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) expect(ids).not.toContain(option.id);

    const [draft] =
      await sql`select status from playlist_draft where id = ${id}`;
    expect(draft.status).toBe("active");
  });

  test("a draft someone else owns is not_found", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const stranger = await asGuest();
    expect((await get(id, "?index=0", stranger.headers)).status).toBe(404);
  });

  test("a missing index is invalid_request", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    expect((await get(id, "", guest.headers)).status).toBe(400);
  });
});
