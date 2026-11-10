import { sessionRequest, type SessionResponse } from "@/contracts";
import { sessionUser } from "@/lib/auth/supabase";
import { ensureAppUser } from "@/modules/billing";
import { claimGuestDrafts } from "@/modules/playlist";

// The end of sign-in: the callback page sends the new session, and the user's
// first sign-in creates their app_user (architecture 5.4). The claim code the
// link carried moves the guest's drafts and cohort to the user (architecture 4,
// claiming). A used, expired or malformed code claims nothing and still signs in.
export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureAppUser(user.id, user.email);
  const body = sessionRequest.safeParse(await request.json().catch(() => ({})));
  if (body.data?.claim) await claimGuestDrafts(body.data.claim, user.id);
  return Response.json({ userId: user.id } satisfies SessionResponse);
}
