import { checkoutRequest } from "@/contracts";
import { sessionUser } from "@/lib/auth/supabase";
import { createCheckout } from "@/modules/billing";
import { fail, readBody, respond } from "@/modules/playlist";

// A Stripe Checkout session for the signed-in user's held draft (architecture
// 7.3 step 3). The entitlement comes later, from the webhook.
export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return fail({ error: "unauthorized" });
  const body = await readBody(request, checkoutRequest);
  if (!body.ok) return respond(body);
  return respond(
    await createCheckout(user.id, body.value, new URL(request.url).origin),
  );
}
