import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signInResponse } from "@/contracts";

// The browser's Supabase client, used only for auth (architecture 9.2). The
// implicit flow returns the session in the redirect's fragment, so an email
// link opened in another browser still signs in: PKCE would need the verifier
// kept by the browser that asked for the link.
let client: SupabaseClient | undefined;
export const auth = () =>
  (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { flowType: "implicit" } },
  )).auth;

// Sends the guest token, when there is one, so the redirect carries a claim
// code; then hands off to Google or sends the email link. The header name is
// GUEST_TOKEN_HEADER in @/lib/auth, which is server-only.
export async function startSignIn(
  method: { provider: "google" } | { email: string },
  guestToken?: string,
): Promise<void> {
  const response = await fetch("/api/auth/sign-in", {
    method: "POST",
    headers: guestToken ? { "x-guest-token": guestToken } : {},
  });
  const { redirectTo } = signInResponse.parse(await response.json());
  const { error } =
    "email" in method
      ? await auth().signInWithOtp({
          email: method.email,
          options: { emailRedirectTo: redirectTo },
        })
      : await auth().signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
  if (error) throw error;
}
