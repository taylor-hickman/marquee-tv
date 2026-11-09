// Entitlements, checkout, Stripe webhooks, the free-playlist rule (architecture 3).
// Lane D fills these in.
import { notImplemented } from "@/contracts";
import type {
  CancelSubscriptions,
  CanRunCurator,
  ConsumeClaimCode,
  CreateCheckout,
  CreatePortal,
  HandleStripeWebhook,
} from "./types";

export type * from "./types";

export const canRunCurator: CanRunCurator = () =>
  notImplemented("billing.canRunCurator");
export const createCheckout: CreateCheckout = () =>
  notImplemented("billing.createCheckout");
export const createPortal: CreatePortal = () =>
  notImplemented("billing.createPortal");
export const handleStripeWebhook: HandleStripeWebhook = () =>
  notImplemented("billing.handleStripeWebhook");
export const consumeClaimCode: ConsumeClaimCode = () =>
  notImplemented("billing.consumeClaimCode");
export const cancelSubscriptions: CancelSubscriptions = () =>
  notImplemented("billing.cancelSubscriptions");
