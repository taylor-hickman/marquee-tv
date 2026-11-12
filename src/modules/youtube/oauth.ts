import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { DraftId, UserId } from "@/contracts";
import { sql } from "@/lib/db";

// The Google grant behind Save to my YouTube (PRD 10.2, architecture 11): an
// incremental grant of the one `youtube` scope, its refresh token encrypted in
// youtube_connection, and revoked at Google on disconnect.

export const SCOPE = "https://www.googleapis.com/auth/youtube";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_TTL_MS = 10 * 60 * 1000;

// The connect route sets it, the callback reads it.
export const NONCE_COOKIE = "yt_oauth_nonce";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

// YOUTUBE_TOKEN_KEY is 32 random bytes, base64. One key for each use.
const key = (use: "token" | "state") =>
  Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(env("YOUTUBE_TOKEN_KEY"), "base64"),
      "",
      use,
      32,
    ),
  );

function encrypt(text: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("token"), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt(sealed: Buffer): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key("token"),
    sealed.subarray(0, 12),
  );
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([
    decipher.update(sealed.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

const sign = (payload: string) =>
  createHmac("sha256", key("state")).update(payload).digest("base64url");
const digest = (nonce: string) =>
  createHash("sha256").update(nonce).digest("base64url");

type State = { d: DraftId; u: UserId; n: string; e: number };

// The draft and user a callback's state was signed for, or null when the
// signature, the expiry or the browser's nonce cookie doesn't match.
function readState(state: string, nonce: string | null): State | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !nonce) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString(),
  ) as State;
  return parsed.e > Date.now() && parsed.n === digest(nonce) ? parsed : null;
}

const redirectUri = (origin: string) => `${origin}/api/youtube/callback`;

// Google's consent screen for this user and draft, and the nonce the route
// sets as a cookie. The callback needs both, so a grant can only land on the
// account of the browser that asked for it.
export function connectUrl(
  userId: UserId,
  draftId: DraftId,
  origin: string,
  email: string,
): { url: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      d: draftId,
      u: userId,
      n: digest(nonce),
      e: Date.now() + STATE_TTL_MS,
    } satisfies State),
  ).toString("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    // A refresh token comes back only on a consent prompt.
    prompt: "consent",
    login_hint: email,
    state: `${payload}.${sign(payload)}`,
  }).toString();
  return { url: url.toString(), nonce };
}

// Google's redirect back. Stores the grant when it holds the youtube scope and
// returns where the browser goes next: the draft, with `?youtube=save` to
// start the export, or plain when the person declined. Null for a state this
// browser didn't start.
export async function finishConnect(
  query: { code?: string; error?: string; state: string },
  nonce: string | null,
  origin: string,
): Promise<string | null> {
  const state = readState(query.state, nonce);
  if (!state) return null;
  const editor = `/d/${state.d}`;
  if (!query.code) return editor;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code: query.code,
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) return editor;
  const tokens = (await response.json()) as {
    refresh_token?: string;
    scope?: string;
  };
  if (!tokens.refresh_token || !tokens.scope?.split(" ").includes(SCOPE)) {
    return editor;
  }
  await sql`
    insert into youtube_connection (user_id, refresh_token)
    select id, ${encrypt(tokens.refresh_token)} from app_user
    where id = ${state.u}
    on conflict (user_id) do update
      set refresh_token = excluded.refresh_token, created_at = now()`;
  return `${editor}?youtube=save`;
}

export async function isConnected(userId: UserId): Promise<boolean> {
  const [row] = await sql`
    select 1 from youtube_connection where user_id = ${userId}`;
  return Boolean(row);
}

// A fresh access token for the user's grant, or null when there is none or
// Google no longer honours it (revoked, or expired in the consent screen's
// Testing mode), in which case the connection is dropped.
export async function accessToken(userId: UserId): Promise<string | null> {
  const [row] = await sql<{ refresh_token: Buffer }[]>`
    select refresh_token from youtube_connection where user_id = ${userId}`;
  if (!row) return null;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      refresh_token: decrypt(row.refresh_token),
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (response.ok) {
    return ((await response.json()) as { access_token: string }).access_token;
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (body.error !== "invalid_grant") {
    throw new Error(`Google token refresh: ${response.status}`);
  }
  await sql`delete from youtube_connection where user_id = ${userId}`;
  return null;
}

// Revokes the grant at Google, then forgets it. A failed revoke still drops
// the row: the person asked to disconnect, and Google's own permissions page
// (linked from /privacy) can revoke it too.
export async function disconnect(userId: UserId): Promise<void> {
  const [row] = await sql<{ refresh_token: Buffer }[]>`
    delete from youtube_connection where user_id = ${userId}
    returning refresh_token`;
  if (!row) return;
  await fetch(REVOKE_URL, {
    method: "POST",
    body: new URLSearchParams({ token: decrypt(row.refresh_token) }),
  }).catch(() => {});
}
