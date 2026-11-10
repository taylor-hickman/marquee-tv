import "server-only";
import { sql } from "@/lib/db";
import { env, stripe } from "./stripe";
import type { CreateCheckout, CreatePortal } from "./types";

// Checkout and the Customer Portal (architecture 7.3 steps 3 and Account
// management). Neither writes an entitlement: the webhook does, from the
// metadata set here.

const notFound = { ok: false, error: { error: "not_found" } } as const;

// The Stripe customer from the user's earlier payments, so the portal shows
// every pass and subscription together.
async function customerOf(userId: string): Promise<string | null> {
  const [row] = await sql<{ stripe_customer_id: string }[]>`
    select stripe_customer_id from entitlement
    where user_id = ${userId} and stripe_customer_id is not null
    order by created_at desc limit 1`;
  return row?.stripe_customer_id ?? null;
}

// A Checkout session for a pass (one-off payment) or the monthly plan, bound to
// the user's held draft. Payment methods come from the Stripe account's default
// configuration, where card, Apple Pay and Google Pay are on (PRD 16.1); this
// API version has no per-session list. Back from Checkout, the plan screen
// polls for the entitlement (E8).
export const createCheckout: CreateCheckout = async (userId, body, origin) => {
  const [draft] = await sql`
    select 1 from playlist_draft
    where id = ${body.draftId} and owner_user_id = ${userId}`;
  if (!draft) return notFound;

  const pass = body.plan === "session_pass";
  const customer = await customerOf(userId);
  const [user] = await sql<{ email: string }[]>`
    select email from app_user where id = ${userId}`;
  const metadata = { userId, draftId: body.draftId, plan: body.plan };
  const back = `${origin}/plan?draft=${body.draftId}`;
  const session = await stripe().checkout.sessions.create({
    mode: pass ? "payment" : "subscription",
    line_items: [
      {
        price: env(pass ? "STRIPE_PRICE_PASS" : "STRIPE_PRICE_MONTHLY"),
        quantity: 1,
      },
    ],
    client_reference_id: userId,
    metadata,
    ...(pass
      ? { payment_intent_data: { metadata } }
      : { subscription_data: { metadata } }),
    ...(customer
      ? { customer }
      : {
          customer_email: user.email,
          ...(pass && { customer_creation: "always" as const }),
        }),
    success_url: `${back}&checkout=complete`,
    cancel_url: back,
  });
  return { ok: true, value: { url: session.url! } };
};

// The Customer Portal for cancel, switch plan and update card (J10). A user who
// has never paid has no Stripe customer and nothing to manage.
export const createPortal: CreatePortal = async (userId, origin) => {
  const customer = await customerOf(userId);
  if (!customer) return notFound;
  const session = await stripe().billingPortal.sessions.create({
    customer,
    return_url: `${origin}/account`,
  });
  return { ok: true, value: { url: session.url } };
};
