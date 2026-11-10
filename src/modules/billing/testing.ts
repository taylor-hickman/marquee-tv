// Signed Stripe webhook events for tests (build plan 6.2). Each event starts
// from the object Stripe publishes as its fixture (stripe/openapi
// fixtures3.json at the SDK's OpenAPI version, the data stripe-mock serves) and
// sets only the fields this app reads. Sign it with `webhookRequest`; set
// STRIPE_WEBHOOK_SECRET to WEBHOOK_SECRET in the server under test.

import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import type { DraftId, UserId } from "@/contracts";
import fixtures from "./fixtures/stripe-v2596.json";

export const WEBHOOK_SECRET = "whsec_marquee_test";

const id = (prefix: string) =>
  `${prefix}_test${randomBytes(9).toString("hex")}`;
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

type Bound = { userId: UserId; draftId: DraftId };

function event(type: string, object: object, created = new Date()) {
  return {
    ...fixtures.event,
    id: id("evt"),
    type,
    created: seconds(created),
    data: { object },
  } as unknown as Stripe.Event;
}

// A completed Checkout for a pass (one-off payment) or the monthly plan,
// carrying the metadata createCheckout sets.
export function checkoutCompleted(
  o: Bound & {
    plan: "session_pass" | "subscription";
    created?: Date;
    customerId?: string;
    subscriptionId?: string;
    paymentStatus?: Stripe.Checkout.Session.PaymentStatus;
  },
) {
  const pass = o.plan === "session_pass";
  return event(
    "checkout.session.completed",
    {
      ...fixtures["checkout.session"],
      id: id("cs"),
      mode: pass ? "payment" : "subscription",
      status: "complete",
      payment_status: o.paymentStatus ?? "paid",
      client_reference_id: o.userId,
      customer: o.customerId ?? id("cus"),
      payment_intent: pass ? id("pi") : null,
      subscription: pass ? null : (o.subscriptionId ?? id("sub")),
      metadata: { userId: o.userId, draftId: o.draftId, plan: o.plan },
    },
    o.created,
  );
}

// A paid subscription invoice. Stripe copies the subscription's metadata onto
// `parent.subscription_details`.
export function invoicePaid(
  o: Bound & { subscriptionId: string; customerId?: string; periodEnd: Date },
) {
  const line = fixtures.invoice.lines.data[0];
  return event("invoice.paid", {
    ...fixtures.invoice,
    id: id("in"),
    status: "paid",
    customer: o.customerId ?? id("cus"),
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: {
        subscription: o.subscriptionId,
        metadata: { userId: o.userId, draftId: o.draftId },
      },
    },
    lines: {
      ...fixtures.invoice.lines,
      data: [
        {
          ...line,
          period: { start: line.period.start, end: seconds(o.periodEnd) },
        },
      ],
    },
  });
}

export function subscriptionChanged(
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  o: Bound & {
    subscriptionId: string;
    customerId?: string;
    status: Stripe.Subscription.Status;
    periodEnd: Date;
  },
) {
  const items = fixtures.subscription.items;
  return event(type, {
    ...fixtures.subscription,
    id: o.subscriptionId,
    customer: o.customerId ?? id("cus"),
    status: o.status,
    metadata: { userId: o.userId, draftId: o.draftId },
    items: {
      ...items,
      data: [{ ...items.data[0], current_period_end: seconds(o.periodEnd) }],
    },
  });
}

// The POST Stripe would send, signed with WEBHOOK_SECRET unless `signature`
// replaces the header (null leaves it off).
export function webhookRequest(
  stripeEvent: Stripe.Event,
  signature?: string | null,
): Request {
  const payload = JSON.stringify(stripeEvent);
  const header =
    signature === undefined
      ? Stripe.webhooks.generateTestHeaderString({
          payload,
          secret: WEBHOOK_SECRET,
        })
      : signature;
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: header === null ? {} : { "stripe-signature": header },
    body: payload,
  });
}
