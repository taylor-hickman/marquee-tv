import { sql } from "@/test/db";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { draftView } from "@/contracts";
import { asGuest } from "@/lib/auth/testing";
import { aiItem, catalogIds, draftAt } from "@/modules/playlist/testing";
import { POST as ops } from "../ops/route";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const request = (
  path: string,
  body: unknown,
  headers: Record<string, string>,
) =>
  new Request(`http://localhost/api/drafts/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const undo = (
  id: string,
  baseRevision: number,
  headers: Record<string, string>,
) => POST(request(`${id}/undo`, { baseRevision }, headers), params(id));

let ids: number[];
let guest: Awaited<ReturnType<typeof asGuest>>;

beforeAll(async () => {
  ids = await catalogIds(3);
  guest = await asGuest();
});

describe("POST /api/drafts/:id/undo", () => {
  test("undoing a removal un-removes it as a new revision", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const removed = await ops(
      request(
        `${id}/ops`,
        { baseRevision: 1, ops: [{ op: "remove", performance_id: ids[1] }] },
        guest.headers,
      ),
      params(id),
    );
    expect(draftView.parse(await removed.json()).revision!.removedIds).toEqual([
      ids[1],
    ]);

    const response = await undo(id, 2, guest.headers);
    expect(response.status).toBe(200);
    const view = draftView.parse(await response.json());
    expect(view.revision).toMatchObject({
      number: 3,
      trigger: "undo",
      items: ids.map(aiItem),
      removedIds: [],
    });
    expect(view.performances.map((p) => p.id)).toEqual(ids);
    const history =
      await sql`select number, trigger from playlist_revision where draft_id = ${id} order by number`;
    expect(history.map((r) => r.trigger)).toEqual(["generate", "edit", "undo"]);
  });

  test("a stale baseRevision gets 409 with the current draft", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    await ops(
      request(
        `${id}/ops`,
        { baseRevision: 1, ops: [{ op: "remove", performance_id: ids[0] }] },
        guest.headers,
      ),
      params(id),
    );
    const response = await undo(id, 1, guest.headers);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(draftView.parse(body.current).revision!.number).toBe(2);
  });

  test("a read_only draft refuses undo", async () => {
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      status: "read_only",
    });
    const response = await undo(id, 1, guest.headers);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "read_only" });
  });

  test("the first revision has nothing to undo", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const response = await undo(id, 1, guest.headers);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      issues: ["baseRevision: nothing to undo"],
    });
  });

  test("a wrong owner gets 404", async () => {
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const response = await undo(id, 1, (await asGuest()).headers);
    expect(response.status).toBe(404);
  });
});
