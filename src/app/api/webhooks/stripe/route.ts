import { handleStripeWebhook } from "@/modules/billing";
import { respond } from "@/modules/playlist";

// Stripe's events, the only writer of entitlements (architecture 7.3, 9.2).
// The body is read raw: the signature covers its exact bytes.
export async function POST(request: Request) {
  return respond(
    await handleStripeWebhook(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
    ),
  );
}
