import type { SessionResponse } from "@/contracts";
import { sessionUser } from "@/lib/auth/supabase";
import { ensureAppUser } from "@/modules/billing";

// The end of sign-in: the callback page sends the new session, and the user's
// first sign-in creates their app_user (architecture 5.4).
export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureAppUser(user.id, user.email);
  return Response.json({ userId: user.id } satisfies SessionResponse);
}
