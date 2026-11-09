import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ApiResult, GuestId, Owner, UserId } from "@/contracts";
import { sql } from "@/lib/db";

// Who a request acts for (architecture 4). A guest sends its bearer token in a
// header, never a cookie; a signed-in user sends the Supabase access token.
export const GUEST_TOKEN_HEADER = "x-guest-token";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest();

// A new guest with a random 128-bit token. Only the token's hash is stored; the
// token goes back to the client once. The beta cohort is set here (PRD 16.4).
export async function issueGuest(
  ipHash: Buffer,
): Promise<{ guestId: GuestId; token: string }> {
  const token = randomBytes(16).toString("base64url");
  const cohort = randomInt(2) === 0 ? "pass_first" : "sub_first";
  const [guest] = await sql<{ id: GuestId }[]>`
    insert into guest (token_hash, ip_hash, cohort)
    values (${hashToken(token)}, ${ipHash}, ${cohort})
    returning id`;
  return { guestId: guest.id, token };
}

// The guest a token belongs to, or null. The lookup compares SHA-256 digests of
// the presented token, so its timing says nothing about any stored token: this
// is the constant-time comparison architecture 9.2 asks for.
export async function verifyGuestToken(token: string): Promise<GuestId | null> {
  const [guest] = await sql<{ id: GuestId }[]>`
    update guest set last_seen_at = now()
    where token_hash = ${hashToken(token)}
    returning id`;
  return guest?.id ?? null;
}

let supabase: SupabaseClient | undefined;

// The user behind a Supabase access token, checked with Supabase Auth, or null.
async function verifySession(accessToken: string): Promise<UserId | null> {
  supabase ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(accessToken);
  return error ? null : data.user.id;
}

// Every identity the request proves. A signed-in browser may still send its
// guest token, so both can be present.
async function identify(
  request: Request,
): Promise<{ guestId: GuestId | null; userId: UserId | null }> {
  const token = request.headers.get(GUEST_TOKEN_HEADER);
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  const [guestId, userId] = await Promise.all([
    token ? verifyGuestToken(token) : null,
    bearer ? verifySession(bearer) : null,
  ]);
  return { guestId, userId };
}

// The request's owner, preferring the signed-in user; null when it proves none.
export async function getOwner(request: Request): Promise<Owner | null> {
  const { guestId, userId } = await identify(request);
  if (userId) return { kind: "user", userId };
  if (guestId) return { kind: "guest", guestId };
  return null;
}

type OwnedDraft = { ownerGuestId: GuestId | null; ownerUserId: UserId | null };

// The owner a draft request acts as. No valid credential is `unauthorized`; a
// draft the request doesn't own is `not_found`, so other drafts' ids leak nothing.
export async function requireOwner(
  request: Request,
  draft: OwnedDraft,
): Promise<ApiResult<Owner>> {
  const { guestId, userId } = await identify(request);
  if (!guestId && !userId) {
    return { ok: false, error: { error: "unauthorized" } };
  }
  if (userId && userId === draft.ownerUserId) {
    return { ok: true, value: { kind: "user", userId } };
  }
  if (guestId && guestId === draft.ownerGuestId) {
    return { ok: true, value: { kind: "guest", guestId } };
  }
  return { ok: false, error: { error: "not_found" } };
}
