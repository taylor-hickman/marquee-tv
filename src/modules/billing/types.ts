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

// `origin` is where Checkout and the portal send the person back to. A draft the
// user doesn't own, or a user with no Stripe customer for the portal, is
// `not_found`.
export type CreateCheckout = (
  userId: UserId,
  body: CheckoutRequest,
  origin: string,
) => Promise<ApiResult<UrlResponse>>;

export type CreatePortal = (
  userId: UserId,
  origin: string,
) => Promise<ApiResult<UrlResponse>>;

// Flips pass drafts past period_end to read_only, all of them or one, and
// returns the ids flipped.
export type ExpirePasses = (now: Date, draftId?: DraftId) => Promise<DraftId[]>;

// The only writer of entitlements. A bad signature is `invalid_request`.
export type HandleStripeWebhook = (
  rawBody: string,
  signature: string,
) => Promise<ApiResult<StripeWebhookResponse>>;

// The guest a one-time claim code was minted for, once; null after that (D1).
export type ConsumeClaimCode = (code: string) => Promise<GuestId | null>;

// Account deletion cancels any active subscription at Stripe first (D3).
export type CancelSubscriptions = (userId: UserId) => Promise<void>;
