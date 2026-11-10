import type { SignInResponse } from "@/contracts";
import { GUEST_TOKEN_HEADER, verifyGuestToken } from "@/lib/auth";
import { mintClaimCode } from "@/modules/billing";

// The start of sign-in (architecture 7.3 step 2). A guest gets a one-time claim
// code in the callback URL, which the browser hands to Supabase Auth as the
// Google or email link redirect, so the claim survives a different browser.
export async function POST(request: Request) {
  const token = request.headers.get(GUEST_TOKEN_HEADER);
  const guestId = token ? await verifyGuestToken(token) : null;
  const redirectTo = new URL("/auth/callback", request.url);
  if (guestId) {
    redirectTo.searchParams.set("claim", await mintClaimCode(guestId));
  }
  return Response.json({
    redirectTo: redirectTo.toString(),
  } satisfies SignInResponse);
}
