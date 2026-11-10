import "server-only";
import Stripe from "stripe";
import type { DraftId, UserId } from "@/contracts";
import { grantPass, saveSubscription } from "./entitlements";
import { env, stripe } from "./stripe";
import type { HandleStripeWebhook } from "./types";

// POST /api/webhooks/stripe (architecture 7.3 step 4, 9.2). The signature is
// checked on the raw body before anything is read. Events for objects this app
// didn't create (no userId in their metadata) are acknowledged and skipped.

const date = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000) : null;

const idOf = (ref: string | { id: string } | null) =>
  typeof ref === "string" ? ref : (ref?.id ?? null);

// The user and held draft createCheckout put in the metadata.
function bound(metadata: Stripe.Metadata | null | undefined) {
  const userId = metadata?.userId as UserId | undefined;
  const draftId = (metadata?.draftId ?? null) as DraftId | null;
  return userId ? { userId, draftId } : null;
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const to = bound(session.metadata);
      if (!to || session.payment_status !== "paid") return;
      if (session.mode === "payment" && to.draftId && session.payment_intent) {
        return grantPass({
          ...to,
          draftId: to.draftId,
          customerId: idOf(session.customer),
          paymentIntentId: idOf(session.payment_intent)!,
          paidAt: date(event.created)!,
        });
      }
      if (session.mode === "subscription" && session.subscription) {
        return saveSubscription({
          ...to,
          customerId: idOf(session.customer),
          subscriptionId: idOf(session.subscription)!,
          status: "active",
          periodEnd: null,
        });
      }
      return;
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const details = invoice.parent?.subscription_details;
      const to = bound(details?.metadata);
      if (!to || !details?.subscription) return;
      return saveSubscription({
        ...to,
        customerId: idOf(invoice.customer),
        subscriptionId: idOf(details.subscription)!,
        status: "active",
        periodEnd: date(
          Math.max(...invoice.lines.data.map((line) => line.period.end)),
        ),
      });
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const to = bound(subscription.metadata);
      if (!to) return;
      return saveSubscription({
        ...to,
        customerId: idOf(subscription.customer),
        subscriptionId: subscription.id,
        status: subscription.status,
        periodEnd: date(
          Math.max(
            ...subscription.items.data.map((item) => item.current_period_end),
          ),
        ),
      });
    }
  }
}

export const handleStripeWebhook: HandleStripeWebhook = async (
  rawBody,
  signature,
) => {
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      env("STRIPE_WEBHOOK_SECRET"),
    );
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeSignatureVerificationError)) {
      throw error;
    }
    return {
      ok: false,
      error: {
        error: "invalid_request",
        issues: ["stripe-signature: invalid"],
      },
    };
  }
  await handle(event);
  return { ok: true, value: { received: true } };
};
