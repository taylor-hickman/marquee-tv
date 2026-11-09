import { sql } from "@/test/db";
import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import * as factories from "@/test/factories";
import {
  GUEST_TOKEN_HEADER,
  getOwner,
  issueGuest,
  requireOwner,
  verifyGuestToken,
} from ".";
import { asGuest, asUser } from "./testing";

vi.mock("server-only", () => ({}));

const ip = createHash("sha256").update("203.0.113.7").digest();
const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/drafts/x", { headers });

describe("guest tokens", () => {
  test("issue stores only the hash of a 128-bit token, with a cohort", async () => {
    const { guestId, token } = await issueGuest(ip);
    expect(Buffer.from(token, "base64url")).toHaveLength(16);
    const [row] = await sql`select * from guest where id = ${guestId}`;
    expect(row.token_hash).toEqual(createHash("sha256").update(token).digest());
    expect(row.ip_hash).toEqual(ip);
    expect(["pass_first", "sub_first"]).toContain(row.cohort);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  test("verify returns the guest and marks it seen", async () => {
    const { guestId, token } = await issueGuest(ip);
    await sql`update guest set last_seen_at = '2026-01-01' where id = ${guestId}`;
    expect(await verifyGuestToken(token)).toBe(guestId);
    const [row] =
      await sql`select last_seen_at from guest where id = ${guestId}`;
    expect(row.last_seen_at.getTime()).toBeGreaterThan(
      Date.parse("2026-02-01"),
    );
  });

  test("a wrong token is rejected", async () => {
    const { token } = await issueGuest(ip);
    const wrong = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(await verifyGuestToken(wrong)).toBeNull();
    expect(await verifyGuestToken("")).toBeNull();
  });
});

describe("getOwner", () => {
  test("is null without credentials or with a wrong token", async () => {
    expect(await getOwner(request())).toBeNull();
    expect(
      await getOwner(request({ [GUEST_TOKEN_HEADER]: "not-a-token" })),
    ).toBeNull();
  });

  test("attaches the guest", async () => {
    const guest = await asGuest();
    expect(await getOwner(request(guest.headers))).toEqual({
      kind: "guest",
      guestId: guest.guestId,
    });
  });

  test("prefers the signed-in user over the guest token", async () => {
    const [guest, user] = await Promise.all([asGuest(), asUser()]);
    expect(
      await getOwner(request({ ...guest.headers, ...user.headers })),
    ).toEqual({ kind: "user", userId: user.userId });
  });

  test("rejects a bad session", async () => {
    expect(
      await getOwner(request({ authorization: "Bearer not-a-jwt" })),
    ).toBeNull();
  });
});

describe("requireOwner", () => {
  test("accepts the owning guest's token", async () => {
    const guest = await asGuest();
    const draft = { ownerGuestId: guest.guestId, ownerUserId: null };
    expect(await requireOwner(request(guest.headers), draft)).toEqual({
      ok: true,
      value: { kind: "guest", guestId: guest.guestId },
    });
  });

  test("accepts the owning user's session", async () => {
    const user = await asUser();
    const draft = await factories.playlistDraft({ owner_user_id: user.userId });
    expect(
      await requireOwner(request(user.headers), {
        ownerGuestId: draft.owner_guest_id,
        ownerUserId: draft.owner_user_id,
      }),
    ).toEqual({ ok: true, value: { kind: "user", userId: user.userId } });
  });

  test("accepts a guest token alongside another user's session", async () => {
    const [guest, user] = await Promise.all([asGuest(), asUser()]);
    const draft = { ownerGuestId: guest.guestId, ownerUserId: null };
    expect(
      await requireOwner(request({ ...user.headers, ...guest.headers }), draft),
    ).toEqual({ ok: true, value: { kind: "guest", guestId: guest.guestId } });
  });

  test("is unauthorized without a valid credential", async () => {
    const guest = await asGuest();
    const draft = { ownerGuestId: guest.guestId, ownerUserId: null };
    expect(
      await requireOwner(request({ [GUEST_TOKEN_HEADER]: "wrong" }), draft),
    ).toEqual({ ok: false, error: { error: "unauthorized" } });
  });

  test("hides another owner's draft as not_found", async () => {
    const [owner, other] = await Promise.all([asGuest(), asGuest()]);
    const draft = { ownerGuestId: owner.guestId, ownerUserId: null };
    expect(await requireOwner(request(other.headers), draft)).toEqual({
      ok: false,
      error: { error: "not_found" },
    });
  });
});
