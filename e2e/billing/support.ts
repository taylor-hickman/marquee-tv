// Users, drafts and Stripe events for the billing specs, on the local stack
// the server under test uses (playwright.config.ts).

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import type Stripe from "stripe";
import { webhookRequest } from "@/modules/billing/testing";

export const stack: {
  API_URL: string;
  DB_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
  MAILPIT_URL?: string;
  INBUCKET_URL?: string;
} = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);

export const sql = postgres(stack.DB_URL, { onnotice: () => {} });

// Where the browser's Supabase client keeps its session (supabase-js default).
const storageKey = `sb-${new URL(stack.API_URL).hostname.split(".")[0]}-auth-token`;

// A new user, signed in through the app's own POST /api/auth/session, with the
// session waiting in the page's local storage before any script runs.
export async function signedInUser(page: Page, request: APIRequestContext) {
  const admin = createClient(stack.API_URL, stack.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth;
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(16).toString("base64url");
  const created = await admin.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const signedIn = await admin.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const session = signedIn.data.session;
  const response = await request.post("/api/auth/session", {
    headers: { authorization: `Bearer ${session.access_token}` },
  });
  expect(response.ok()).toBe(true);
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [storageKey, JSON.stringify(session)],
  );
  return { userId: created.data.user.id, email, storageKey };
}

// A draft owned by the user. With `videoIds`, its first revision holds those
// seeded performances in order; without, it has none, as a held brief does.
export async function userDraft(
  userId: string,
  o: { status?: string; title?: string; performances?: number } = {},
) {
  const [draft] = await sql<{ id: string }[]>`
    insert into playlist_draft (owner_user_id, creation_method, status, title)
    values (${userId}, 'typed', ${o.status ?? "active"}, ${o.title ?? null})
    returning id`;
  if (!o.performances) return { id: draft.id, videoIds: [] as string[] };
  const rows = await sql<{ id: number; video_id: string }[]>`
    select p.id, p.video_id from performance p
    where p.eligible
      and exists (select 1 from performance_artist pa where pa.performance_id = p.id)
    order by p.id limit ${o.performances}`;
  const items = rows.map((r) => ({
    performance_id: r.id,
    pinned: "none",
    source: "ai",
  }));
  await sql`insert into playlist_revision (draft_id, number, items, trigger)
            values (${draft.id}, 1, ${sql.json(items)}, 'generate')`;
  await sql`update playlist_draft set current_revision = 1 where id = ${draft.id}`;
  return { id: draft.id, videoIds: rows.map((r) => r.video_id) };
}

// Sends a Stripe event to the app as Stripe would, signed with the test secret.
export async function deliver(request: APIRequestContext, event: Stripe.Event) {
  const signed = webhookRequest(event);
  const response = await request.post("/api/webhooks/stripe", {
    headers: Object.fromEntries(signed.headers),
    data: await signed.text(),
  });
  expect(response.status()).toBe(200);
}

// The newest sign-in link the local stack's mail server holds for `email`.
export async function signInLink(email: string): Promise<string> {
  const mail =
    stack.MAILPIT_URL ?? stack.INBUCKET_URL ?? "http://127.0.0.1:54324";
  let id: string | undefined;
  await expect
    .poll(async () => {
      const response = await fetch(
        `${mail}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
      );
      id = (await response.json()).messages?.[0]?.ID;
      return id;
    })
    .toBeTruthy();
  const message = await (await fetch(`${mail}/api/v1/message/${id}`)).json();
  const link = String(message.HTML ?? message.Text).match(
    /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/,
  )?.[0];
  if (!link) throw new Error(`no sign-in link in the mail to ${email}`);
  return link.replaceAll("&amp;", "&");
}
