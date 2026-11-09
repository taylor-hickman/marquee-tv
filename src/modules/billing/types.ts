import type {
  ApiResult,
  CheckoutRequest,
  DraftId,
  DraftStatus,
  EntitlementState,
  GuestId,
  Owner,
  StripeWebhookResponse,
  UrlResponse,
  UserId,
} from "@/contracts";

// The draft fields the entitlement table in architecture 7.3 reads.
export type EntitlementDraft = {
  id: DraftId;
  free: boolean;
  status: DraftStatus;
  entitlementId: string | null;
};

// Called by playlist before every generate, refine, regenerate and fill-the-rest,
// never on draft creation, manual edits, replace, play or copy (CLAUDE.md rule 3).
export type CanRunCurator = (
  owner: Owner,
  draft: EntitlementDraft,
  now: Date,
) => Promise<EntitlementState>;

export type CreateCheckout = (
  userId: UserId,
  body: CheckoutRequest,
) => Promise<UrlResponse>;

export type CreatePortal = (userId: UserId) => Promise<UrlResponse>;

// The only writer of entitlements. A bad signature is `invalid_request`.
export type HandleStripeWebhook = (
  rawBody: string,
  signature: string,
) => Promise<ApiResult<StripeWebhookResponse>>;

// The guest a one-time claim code was minted for, once; null after that (D1).
export type ConsumeClaimCode = (code: string) => Promise<GuestId | null>;

// Account deletion cancels any active subscription at Stripe first (D3).
export type CancelSubscriptions = (userId: UserId) => Promise<void>;
