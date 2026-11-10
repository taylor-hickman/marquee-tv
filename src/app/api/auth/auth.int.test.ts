import { sql } from "@/test/db";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import { sessionResponse, signInResponse } from "@/contracts";
import { requireOwner } from "@/lib/auth";
import { asGuest, stack } from "@/lib/auth/testing";
import { consumeClaimCode } from "@/modules/billing";
import * as factories from "@/test/factories";
import { POST as session } from "./session/route";
import { POST as signIn } from "./sign-in/route";

vi.mock("server-only", () => ({}));

// The local stack's site URL, so Auth accepts redirects back to it.
const origin = "http://127.0.0.1:3000";

const startSignIn = async (headers: Record<string, string> = {}) => {
  const response = await signIn(
    new Request(`${origin}/api/auth/sign-in`, { method: "POST", headers }),
  );
  expect(response.status).toBe(200);
  return new URL(signInResponse.parse(await response.json()).redirectTo);
};

const completeSignIn = (accessToken?: string) =>
  session(
    new Request(`${origin}/api/auth/session`, {
      method: "POST",
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    }),
  );

// Opens a magic link the way the browser does, possibly a different browser
// from the one that started sign-in: Auth redirects to `redirectTo` with the
// session in the fragment (implicit flow). The new user's auth.users row is
// mirrored into the test's database, where app_user references it.
async function followMagicLink(redirectTo: URL) {
  const email = `${randomUUID()}@example.test`;
  const { data, error } = await createClient(stack.API_URL, stack.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: redirectTo.toString() },
  });
  if (error) throw error;
  const response = await fetch(data.properties.action_link, {
    redirect: "manual",
  });
  const landed = new URL(response.headers.get("location")!);
  await sql`insert into auth.users (id, email, aud, role)
            values (${data.user.id}, ${email}, 'authenticated', 'authenticated')`;
  return {
    landed,
    email,
    userId: data.user.id,
    accessToken: new URLSearchParams(landed.hash.slice(1)).get("access_token")!,
  };
}

describe("POST /api/auth/sign-in", () => {
  test("mints a claim code for the guest that the magic link carries back", async () => {
    const guest = await asGuest();
    const redirectTo = await startSignIn(guest.headers);
    expect(redirectTo.origin + redirectTo.pathname).toBe(
      `${origin}/auth/callback`,
    );
    const claim = redirectTo.searchParams.get("claim")!;

    const { landed } = await followMagicLink(redirectTo);
    expect(landed.pathname).toBe("/auth/callback");
    expect(landed.searchParams.get("claim")).toBe(claim);
    expect(await consumeClaimCode(claim)).toBe(guest.guestId);
  });

  test("mints no claim code without a valid guest token", async () => {
    const tries: Record<string, string>[] = [
      {},
      { "x-guest-token": "not-a-token" },
    ];
    for (const headers of tries) {
      const redirectTo = await startSignIn(headers);
      expect(redirectTo.toString()).toBe(`${origin}/auth/callback`);
    }
  });
});

describe("POST /api/auth/session", () => {
  test("creates the app_user on first sign-in", async () => {
    const user = await followMagicLink(await startSignIn());
    const response = await completeSignIn(user.accessToken);
    expect(response.status).toBe(200);
    expect(sessionResponse.parse(await response.json())).toEqual({
      userId: user.userId,
    });
    expect(await completeSignIn(user.accessToken)).toHaveProperty(
      "status",
      200,
    );
    expect(
      await sql`select email from app_user where id = ${user.userId}`,
    ).toEqual([{ email: user.email }]);
  });

  test("is unauthorized without a valid session", async () => {
    for (const token of [undefined, "not-a-jwt"]) {
      const response = await completeSignIn(token);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });
});

test("a session passes requireOwner on a draft claimed from its guest", async () => {
  const guest = await asGuest();
  const draft = await factories.playlistDraft({
    owner_guest_id: guest.guestId,
  });
  const redirectTo = await startSignIn(guest.headers);
  const user = await followMagicLink(redirectTo);
  await completeSignIn(user.accessToken);

  // C4's claimGuestDrafts consumes the code and moves the drafts like this.
  const claimed = await consumeClaimCode(redirectTo.searchParams.get("claim")!);
  expect(claimed).toBe(guest.guestId);
  const [moved] = await sql`
    update playlist_draft set owner_user_id = ${user.userId}, owner_guest_id = null
    where owner_guest_id = ${claimed} returning *`;
  expect(moved.id).toBe(draft.id);

  const owned = { ownerGuestId: null, ownerUserId: user.userId };
  const request = (headers: Record<string, string>) =>
    new Request(`${origin}/api/drafts/${draft.id}`, { headers });
  expect(
    await requireOwner(
      request({ authorization: `Bearer ${user.accessToken}` }),
      owned,
    ),
  ).toEqual({ ok: true, value: { kind: "user", userId: user.userId } });
  expect(await requireOwner(request(guest.headers), owned)).toEqual({
    ok: false,
    error: { error: "not_found" },
  });
  expect(
    await consumeClaimCode(redirectTo.searchParams.get("claim")!),
  ).toBeNull();
});
