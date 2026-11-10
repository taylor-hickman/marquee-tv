import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import type { Owner } from "@/contracts";
import * as factories from "@/test/factories";
import { canRunCurator, expirePasses, type EntitlementDraft } from ".";

vi.mock("server-only", () => ({}));

const DAY = 86_400_000;
const now = new Date("2026-12-01T12:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * DAY);

const asDraft = (row: Record<string, unknown>): EntitlementDraft => ({
  id: row.id as string,
  free: row.free as boolean,
  status: row.status as EntitlementDraft["status"],
  entitlementId: (row.entitlement_id as string | null) ?? null,
});

const statusOf = async (id: string) =>
  (await sql`select status from playlist_draft where id = ${id}`)[0].status;

async function guestOwner() {
  const guest = await factories.guest();
  const owner: Owner = { kind: "guest", guestId: guest.id };
  const draft = (o: Record<string, unknown> = {}) =>
    factories.playlistDraft({ owner_guest_id: guest.id, ...o }).then(asDraft);
  return { owner, draft };
}

async function userOwner() {
  const user = await factories.appUser();
  const owner: Owner = { kind: "user", userId: user.id };
  const draft = (o: Record<string, unknown> = {}) =>
    factories.playlistDraft({ owner_user_id: user.id, ...o }).then(asDraft);
  return { userId: user.id as string, owner, draft };
}

async function passDraft(
  user: Awaited<ReturnType<typeof userOwner>>,
  periodEnd: Date,
) {
  const pass = await factories.entitlement({
    user_id: user.userId,
    kind: "session_pass",
    period_end: periodEnd,
  });
  return user.draft({ entitlement_id: pass.id });
}

// Architecture 7.3, one test per cell of the entitlement table.
describe("canRunCurator: guest", () => {
  test("runs on their free draft", async () => {
    const guest = await guestOwner();
    const free = await guest.draft({ free: true });
    expect(await canRunCurator(guest.owner, free, now)).toBe("free");
  });

  test("a first model-backed draft will become the free one", async () => {
    const guest = await guestOwner();
    await guest.draft();
    expect(await canRunCurator(guest.owner, await guest.draft(), now)).toBe(
      "free",
    );
  });

  test("any other draft needs payment", async () => {
    const guest = await guestOwner();
    await guest.draft({ free: true });
    const second = await guest.draft({ status: "awaiting_payment" });
    expect(await canRunCurator(guest.owner, second, now)).toBe(
      "payment_required",
    );
  });

  test("a read_only draft stays read_only", async () => {
    const guest = await guestOwner();
    const locked = await guest.draft({ status: "read_only" });
    expect(await canRunCurator(guest.owner, locked, now)).toBe("read_only");
  });
});

describe("canRunCurator: pass holder", () => {
  test("runs on the pass's draft until period_end", async () => {
    const user = await userOwner();
    await user.draft({ free: true });
    const draft = await passDraft(user, at(1));
    expect(await canRunCurator(user.owner, draft, now)).toBe("pass");
    expect(await canRunCurator(user.owner, draft, at(1))).toBe("read_only");
  });

  test("at period_end the draft becomes read_only", async () => {
    const user = await userOwner();
    const draft = await passDraft(user, now);
    expect(await canRunCurator(user.owner, draft, now)).toBe("read_only");
    expect(await statusOf(draft.id)).toBe("read_only");
  });

  test("runs on their claimed free draft, always", async () => {
    const user = await userOwner();
    await passDraft(user, at(-30));
    const free = await user.draft({ free: true });
    expect(await canRunCurator(user.owner, free, now)).toBe("free");
  });

  test("another draft needs payment", async () => {
    const user = await userOwner();
    await user.draft({ free: true });
    await passDraft(user, at(3));
    const other = await user.draft();
    expect(await canRunCurator(user.owner, other, now)).toBe(
      "payment_required",
    );
  });

  test("someone else's pass doesn't count", async () => {
    const holder = await userOwner();
    const pass = await factories.entitlement({
      user_id: holder.userId,
      kind: "session_pass",
      period_end: at(3),
    });
    const user = await userOwner();
    await user.draft({ free: true });
    const draft = await user.draft({ entitlement_id: pass.id });
    expect(await canRunCurator(user.owner, draft, now)).toBe(
      "payment_required",
    );
  });
});

describe("canRunCurator: subscriber", () => {
  test("runs on any of their drafts while active", async () => {
    const user = await userOwner();
    await user.draft({ free: true });
    await factories.entitlement({ user_id: user.userId, status: "active" });
    for (const draft of [
      await user.draft(),
      await user.draft({ status: "awaiting_payment" }),
      await passDraft(user, at(-1)),
    ]) {
      expect(await canRunCurator(user.owner, draft, now)).toBe("subscription");
    }
  });

  test("after cancellation, a lapsed draft is read_only and others need payment", async () => {
    const user = await userOwner();
    await user.draft({ free: true });
    await factories.entitlement({ user_id: user.userId, status: "canceled" });
    const lapsed = await user.draft({ status: "read_only" });
    expect(await canRunCurator(user.owner, lapsed, now)).toBe("read_only");
    expect(await canRunCurator(user.owner, await user.draft(), now)).toBe(
      "payment_required",
    );
  });

  test("a past_due subscription doesn't count", async () => {
    const user = await userOwner();
    await user.draft({ free: true });
    await factories.entitlement({ user_id: user.userId, status: "past_due" });
    expect(await canRunCurator(user.owner, await user.draft(), now)).toBe(
      "payment_required",
    );
  });
});

describe("expirePasses", () => {
  test("a pass draft becomes read_only at period_end, not before", async () => {
    const user = await userOwner();
    const draft = await passDraft(user, at(7));

    expect(await expirePasses(new Date(at(7).getTime() - 1))).not.toContain(
      draft.id,
    );
    expect(await statusOf(draft.id)).toBe("active");

    expect(await expirePasses(at(7))).toContain(draft.id);
    expect(await statusOf(draft.id)).toBe("read_only");
  });

  test("leaves a subscriber's drafts open and touches only the draft asked for", async () => {
    const subscriber = await userOwner();
    await factories.entitlement({ user_id: subscriber.userId });
    const kept = await passDraft(subscriber, at(-1));
    const user = await userOwner();
    const one = await passDraft(user, at(-1));
    const other = await passDraft(user, at(-1));

    expect(await expirePasses(now, one.id)).toEqual([one.id]);
    expect(await statusOf(other.id)).toBe("active");
    expect(await expirePasses(now)).not.toContain(kept.id);
    expect(await statusOf(kept.id)).toBe("active");
  });
});
