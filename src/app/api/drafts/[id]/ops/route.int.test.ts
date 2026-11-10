import { sql } from "@/test/db";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { draftView, type Op } from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import { aiItem, catalogIds, draftAt } from "@/modules/playlist/testing";
import * as factories from "@/test/factories";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const post = (id: string, body: unknown, headers: Record<string, string>) =>
  POST(
    new Request(`http://localhost/api/drafts/${id}/ops`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const revisions = (draftId: string) =>
  sql`select number, items, removed_ids, trigger from playlist_revision
      where draft_id = ${draftId} order by number`;

let ids: number[];
let guest: Awaited<ReturnType<typeof asGuest>>;

beforeAll(async () => {
  ids = await catalogIds(5);
  guest = await asGuest();
});

// Applies ops to a fresh three-item draft and returns the parsed response.
async function applied(ops: Op[]) {
  const id = await draftAt(ids.slice(0, 3), { owner_guest_id: guest.guestId });
  const response = await post(id, { baseRevision: 1, ops }, guest.headers);
  expect(response.status).toBe(200);
  return { id, view: draftView.parse(await response.json()) };
}

describe("POST /api/drafts/:id/ops", () => {
  test("pin writes revision 2 with a position pin", async () => {
    const { id, view } = await applied([{ op: "pin", performance_id: ids[1] }]);
    expect(view.revision).toMatchObject({ number: 2, trigger: "edit" });
    expect(view.revision!.items[1]).toEqual({
      ...aiItem(ids[1]),
      pinned: "position",
    });
    expect((await revisions(id)).map((r) => r.number)).toEqual([1, 2]);
    const [draft] =
      await sql`select current_revision from playlist_draft where id = ${id}`;
    expect(draft.current_revision).toBe(2);
  });

  test("unpin clears a pin", async () => {
    const { view } = await applied([
      { op: "pin", performance_id: ids[0] },
      { op: "unpin", performance_id: ids[0] },
    ]);
    expect(view.revision!.items[0]).toEqual(aiItem(ids[0]));
  });

  test("remove drops the row and records it in removedIds", async () => {
    const { view } = await applied([{ op: "remove", performance_id: ids[1] }]);
    expect(view.revision!.items.map((i) => i.performance_id)).toEqual([
      ids[0],
      ids[2],
    ]);
    expect(view.revision!.removedIds).toEqual([ids[1]]);
    expect(view.performances.map((p) => p.id)).toEqual([ids[0], ids[2]]);
  });

  test("move reorders and position-pins the moved row", async () => {
    const { view } = await applied([
      { op: "move", performance_id: ids[2], to_index: 0 },
    ]);
    expect(view.revision!.items).toEqual([
      { ...aiItem(ids[2]), pinned: "position" },
      aiItem(ids[0]),
      aiItem(ids[1]),
    ]);
  });

  test("add records a manual inclusion pin with its card", async () => {
    const { view } = await applied([
      { op: "add", performance_id: ids[3], index: 1 },
    ]);
    expect(view.revision!.items[1]).toEqual({
      performance_id: ids[3],
      pinned: "include",
      source: "manual",
    });
    expect(view.performances[1].id).toBe(ids[3]);
  });

  test("replace swaps the row and records the old one as removed", async () => {
    const { view } = await applied([
      { op: "replace", performance_id: ids[0], with_performance_id: ids[4] },
    ]);
    expect(view.revision!.items[0]).toEqual({
      performance_id: ids[4],
      pinned: "include",
      source: "manual",
    });
    expect(view.revision!.removedIds).toEqual([ids[0]]);
  });

  test("rename sets the title and description and writes a revision", async () => {
    const { view } = await applied([
      { op: "rename", title: "Slow burn", description: "Warm to loud" },
    ]);
    expect(view.draft).toMatchObject({
      title: "Slow burn",
      description: "Warm to loud",
    });
    expect(view.revision!.number).toBe(2);
  });

  test("a hand-built set's first add writes revision 1 from a null base", async () => {
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
      creation_method: "manual",
    });
    const response = await post(
      draft.id,
      { baseRevision: null, ops: [{ op: "add", performance_id: ids[0] }] },
      guest.headers,
    );
    expect(response.status).toBe(200);
    const view = draftView.parse(await response.json());
    expect(view.revision).toMatchObject({ number: 1, trigger: "edit" });
  });

  test("a stale baseRevision gets 409 with the current draft", async () => {
    const id = await draftAt(ids.slice(0, 3), {
      owner_guest_id: guest.guestId,
    });
    const ops = [{ op: "remove", performance_id: ids[0] }];
    expect(
      (await post(id, { baseRevision: 1, ops }, guest.headers)).status,
    ).toBe(200);
    const stale = await post(
      id,
      { baseRevision: 1, ops: [{ op: "pin", performance_id: ids[1] }] },
      guest.headers,
    );
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error).toBe("conflict");
    expect(draftView.parse(body.current).revision!.number).toBe(2);
    expect(await revisions(id)).toHaveLength(2);
  });

  test("a read_only draft refuses ops and writes nothing", async () => {
    const id = await draftAt(ids.slice(0, 3), {
      owner_guest_id: guest.guestId,
      status: "read_only",
    });
    const response = await post(
      id,
      { baseRevision: 1, ops: [{ op: "remove", performance_id: ids[0] }] },
      guest.headers,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "read_only" });
    expect(await revisions(id)).toHaveLength(1);
  });

  test("an awaiting_payment draft still takes manual edits (rule 3)", async () => {
    const id = await draftAt(ids.slice(0, 3), {
      owner_guest_id: guest.guestId,
      status: "awaiting_payment",
    });
    const response = await post(
      id,
      { baseRevision: 1, ops: [{ op: "remove", performance_id: ids[0] }] },
      guest.headers,
    );
    expect(response.status).toBe(200);
  });

  test("a wrong owner gets 404 and no credential gets 401", async () => {
    const id = await draftAt(ids.slice(0, 3), {
      owner_guest_id: guest.guestId,
    });
    const body = {
      baseRevision: 1,
      ops: [{ op: "remove", performance_id: ids[0] }],
    };
    const other = await post(id, body, (await asGuest()).headers);
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: "not_found" });
    expect((await post(id, body, (await asUser()).headers)).status).toBe(404);
    expect((await post(id, body, {})).status).toBe(401);
    expect((await post("not-a-uuid", body, guest.headers)).status).toBe(404);
    expect(await revisions(id)).toHaveLength(1);
  });

  test("a signed-in owner edits their draft", async () => {
    const user = await asUser();
    const id = await draftAt(ids.slice(0, 3), { owner_user_id: user.userId });
    const response = await post(
      id,
      { baseRevision: 1, ops: [{ op: "pin", performance_id: ids[0] }] },
      user.headers,
    );
    expect(response.status).toBe(200);
  });

  test("refuses an op that doesn't fit the list, and an unknown performance", async () => {
    const id = await draftAt(ids.slice(0, 3), {
      owner_guest_id: guest.guestId,
    });
    const missing = await post(
      id,
      { baseRevision: 1, ops: [{ op: "pin", performance_id: ids[4] }] },
      guest.headers,
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({
      error: "invalid_request",
      issues: [`ops.0: performance ${ids[4]} is not in the list`],
    });
    const unknown = await post(
      id,
      { baseRevision: 1, ops: [{ op: "add", performance_id: 999_999_999 }] },
      guest.headers,
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      error: "invalid_request",
      issues: ["ops: performance 999999999 is not in the catalog"],
    });
    const malformed = await post(
      id,
      { baseRevision: 1, ops: [] },
      guest.headers,
    );
    expect(malformed.status).toBe(400);
    expect(await revisions(id)).toHaveLength(1);
  });
});
