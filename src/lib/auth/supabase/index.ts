import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@/contracts";

let supabase: SupabaseClient | undefined;

// The signed-in user behind a request's Authorization: Bearer access token,
// checked with Supabase Auth, or null.
export async function sessionUser(
  request: Request,
): Promise<{ id: UserId; email: string } | null> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  supabase ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  // Google and the email link both sign in with an email address.
  return error ? null : { id: data.user.id, email: data.user.email! };
}
