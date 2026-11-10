import { sessionUser } from "@/lib/auth/supabase";
import { createPortal } from "@/modules/billing";
import { fail, respond } from "@/modules/playlist";

// The Stripe Customer Portal URL for the signed-in user (architecture 7.3,
// Account management).
export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return fail({ error: "unauthorized" });
  return respond(await createPortal(user.id, new URL(request.url).origin));
}
