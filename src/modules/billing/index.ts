// Entitlements, checkout, Stripe webhooks, the free-playlist rule (architecture 3).
import { notImplemented } from "@/contracts";
import type { CancelSubscriptions } from "./types";

export type * from "./types";
export { getAccount } from "./account";
export { createCheckout, createPortal } from "./checkout";
export { canRunCurator, expirePasses } from "./entitlements";
export { consumeClaimCode, ensureAppUser, mintClaimCode } from "./users";
export { handleStripeWebhook } from "./webhook";

export const cancelSubscriptions: CancelSubscriptions = () =>
  notImplemented("billing.cancelSubscriptions");
