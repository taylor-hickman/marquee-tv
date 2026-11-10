// Owners for route handler tests (build plan 6.2). Import @/test/db first, as
// for any integration test, so the guest and user land in the test's database.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { GuestId, UserId } from "@/contracts";
import * as factories from "@/test/factories";
import { GUEST_TOKEN_HEADER, issueGuest } from ".";

// A new guest, and the headers that send its token.
export async function asGuest(): Promise<{
  guestId: GuestId;
  token: string;
  headers: Record<string, string>;
}> {
  const guest = await issueGuest(createHash("sha256").update("test").digest());
  return { ...guest, headers: { [GUEST_TOKEN_HEADER]: guest.token } };
}

// The local stack's Auth, which also verifies sessions in @/lib/auth.
export const stack: {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
} = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
process.env.NEXT_PUBLIC_SUPABASE_URL = stack.API_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = stack.PUBLISHABLE_KEY;

// A new signed-in user, and the headers that send its session. Supabase Auth
// keeps the user in the stack's own database; the app_user row, and the
// auth.users row it references, go in the test's database under the same id.
export async function asUser(): Promise<{
  userId: UserId;
  headers: Record<string, string>;
}> {
  const auth = createClient(stack.API_URL, stack.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth;
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(16).toString("base64url");
  const created = await auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const signedIn = await auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  await factories.appUser({ id: created.data.user.id, email });
  return {
    userId: created.data.user.id,
    headers: { authorization: `Bearer ${signedIn.data.session.access_token}` },
  };
}
