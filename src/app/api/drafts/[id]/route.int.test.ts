import { describe, expect, test, vi } from "vitest";
import { draftView } from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import { aiItem, catalogIds, draftAt } from "@/modules/playlist/testing";
import * as factories from "@/test/factories";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const get = (id: string, headers: Record<string, string>) =>
  GET(new Request(`http://localhost/api/drafts/${id}`, { headers }), {
    params: Promise.resolve({ id }),
  });

const viewOf = async (id: string, headers: Record<string, string>) => {
  const response = await get(id, headers);
  expect(response.status).toBe(200);
  return draftView.parse(await response.json());
};

describe("GET /api/drafts/:id", () => {
  test("returns the current revision, its cards, flags and entitlement", async () => {
    const guest = await asGuest();
    const ids = await catalogIds(3);
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      free: true,
    });
    await factories.curatorRun({ draft_id: id });

    const view = await viewOf(id, guest.headers);
    expect(view.revision).toMatchObject({ number: 1, items: ids.map(aiItem) });
    expect(view.performances.map((p) => p.id)).toEqual(ids);
    expect(view.flags).toEqual({ handoffMode: "url" });
    expect(view.entitlement).toEqual({ state: "free", runsLeft: 24 });
  });

  test("a draft with no revision yet has a null revision", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
      creation_method: "manual",
    });
    const view = await viewOf(draft.id, guest.headers);
    expect(view.revision).toBeNull();
    expect(view.performances).toEqual([]);
  });

  test("entitlement state follows architecture 7.3", async () => {
    const guest = await asGuest();
    await factories.playlistDraft({
      owner_guest_id: guest.guestId,
      free: true,
    });
    const second = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
      creation_method: "typed",
    });
    expect((await viewOf(second.id, guest.headers)).entitlement.state).toBe(
      "payment_required",
    );

    const readOnly = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
      creation_method: "typed",
      status: "read_only",
    });
    expect((await viewOf(readOnly.id, guest.headers)).entitlement.state).toBe(
      "read_only",
    );

    const user = await asUser();
    await factories.playlistDraft({ owner_user_id: user.userId, free: true });
    const pass = await factories.entitlement({
      user_id: user.userId,
      kind: "session_pass",
      period_end: new Date(Date.now() + 86_400_000),
    });
    const passDraft = await factories.playlistDraft({
      owner_user_id: user.userId,
      creation_method: "typed",
      entitlement_id: pass.id,
    });
    expect((await viewOf(passDraft.id, user.headers)).entitlement.state).toBe(
      "pass",
    );

    await factories.entitlement({ user_id: user.userId });
    const other = await factories.playlistDraft({
      owner_user_id: user.userId,
      creation_method: "typed",
    });
    expect((await viewOf(other.id, user.headers)).entitlement.state).toBe(
      "subscription",
    );
  });

  test("a wrong owner gets 404, no credential 401", async () => {
    const guest = await asGuest();
    const id = await draftAt(await catalogIds(1), {
      owner_guest_id: guest.guestId,
    });
    const response = await get(id, (await asGuest()).headers);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect((await get(crypto.randomUUID(), guest.headers)).status).toBe(404);
    expect((await get(id, {})).status).toBe(401);
  });
});
