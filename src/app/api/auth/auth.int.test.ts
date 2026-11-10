import { sql } from "@/test/db";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import { libraryResponse, sessionResponse, signInResponse } from "@/contracts";
import { requireOwner } from "@/lib/auth";
import { asGuest, stack } from "@/lib/auth/testing";
import { consumeClaimCode } from "@/modules/billing";
import * as factories from "@/test/factories";
import { GET as library } from "../library/route";
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

const completeSignIn = (accessToken?: string, claim?: string) =>
  session(
    new Request(`${origin}/api/auth/session`, {
      method: "POST",
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
      body: claim === undefined ? undefined : JSON.stringify({ claim }),
    }),
  );

const libraryOf = async (accessToken: string) => {
  const response = await library(
    new Request(`${origin}/api/library`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  expect(response.status).toBe(200);
  return libraryResponse.parse(await response.json()).drafts.map((d) => d.id);
};

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

  test("claims the guest's drafts with the code the link carried", async () => {
    const guest = await asGuest();
    const drafts = await Promise.all([
      factories.playlistDraft({ owner_guest_id: guest.guestId }),
      factories.playlistDraft({ owner_guest_id: guest.guestId }),
    ]);
    const redirectTo = await startSignIn(guest.headers);
    const claim = redirectTo.searchParams.get("claim")!;
    const user = await followMagicLink(redirectTo);

    const response = await completeSignIn(user.accessToken, claim);
    expect(response.status).toBe(200);
    expect((await libraryOf(user.accessToken)).sort()).toEqual(
      drafts.map((d) => d.id).sort(),
    );

    // The same link opened again, or by someone else, still signs in.
    const other = await followMagicLink(redirectTo);
    const reused = await completeSignIn(other.accessToken, claim);
    expect(reused.status).toBe(200);
    expect(sessionResponse.parse(await reused.json())).toEqual({
      userId: other.userId,
    });
    expect(await libraryOf(other.accessToken)).toEqual([]);
    expect(await libraryOf(user.accessToken)).toHaveLength(2);
  });

  test("ignores a code that was never minted", async () => {
    const user = await followMagicLink(await startSignIn());
    for (const claim of ["not-a-code", ""]) {
      const response = await completeSignIn(user.accessToken, claim);
      expect(response.status).toBe(200);
    }
    expect(await libraryOf(user.accessToken)).toEqual([]);
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
  expect(
    await completeSignIn(
      user.accessToken,
      redirectTo.searchParams.get("claim")!,
    ),
  ).toHaveProperty("status", 200);
  expect(await libraryOf(user.accessToken)).toEqual([draft.id]);

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
