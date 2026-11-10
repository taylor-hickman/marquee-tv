import "server-only";
import Stripe from "stripe";

// The Stripe client. STRIPE_API_BASE points it somewhere other than
// api.stripe.com: stripe-mock in e2e, a fake on localhost in tests (build plan
// 6.1).
let client: Stripe | undefined;

export function stripe(): Stripe {
  if (client) return client;
  const base = process.env.STRIPE_API_BASE
    ? new URL(process.env.STRIPE_API_BASE)
    : undefined;
  client = new Stripe(env("STRIPE_SECRET_KEY"), {
    ...(base && {
      host: base.hostname,
      port: base.port,
      protocol: base.protocol === "http:" ? "http" : "https",
    }),
  });
  return client;
}

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
