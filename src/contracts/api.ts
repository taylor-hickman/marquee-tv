import { z } from "zod";
import { analyticsEvent, handoffEvent } from "./events";
import { briefInput } from "./brief";
import {
  artistId,
  baseRevision,
  draftId,
  performanceCard,
  plan,
  publisherId,
  revisionNumber,
  seriesId,
  shareCode,
  videoId,
} from "./common";
import { creationMethod, draftStatus, draftView, op } from "./draft";
import { streamEvent } from "./stream";

// Request and response bodies for every route in architecture 9.1. GET routes take
// their params and query string as one object. Draft reads and writes return a
// `draftView`; generate and refine stream `streamEvent`s, one per line. Every write
// carries `baseRevision`; a stale one gets 409 with the current draft.

// Routes with no body or query take an empty object; checkout and portal return a URL.
export const emptyRequest = z.strictObject({});
export const urlResponse = z.object({ url: z.url({ protocol: /^https$/ }) });

// Non-2xx bodies, with their status in `errorStatus`.
export const errorBody = z.discriminatedUnion("error", [
  z.object({
    error: z.literal("invalid_request"),
    issues: z.array(z.string()),
  }),
  z.object({ error: z.literal("unauthorized") }),
  // The brief is held on the draft; the plan screen opens on `defaultPlan` (PRD 16.4).
  z.object({ error: z.literal("payment_required"), defaultPlan: plan }),
  z.object({ error: z.literal("read_only") }),
  z.object({ error: z.literal("not_found") }),
  z.object({ error: z.literal("conflict"), current: draftView }),
  z.object({
    error: z.literal("rate_limited"),
    retryAfterS: z.number().int().positive(),
  }),
  // 25 model-backed runs on this draft; manual edits and replace still work.
  z.object({ error: z.literal("run_cap_reached") }),
]);
export type ErrorBody = z.infer<typeof errorBody>;

export const errorStatus = {
  invalid_request: 400,
  unauthorized: 401,
  payment_required: 402,
  read_only: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  run_cap_reached: 429,
} as const satisfies Record<ErrorBody["error"], number>;

// What a module returns to its route: a body, or the error the route sends.
export type ApiResult<T> =
  { ok: true; value: T } | { ok: false; error: ErrorBody };

// POST /api/drafts. The guest token comes back only when the request had none.
export const createDraftRequest = z.object({
  creationMethod,
  input: briefInput.optional(),
});
export const createDraftResponse = z.object({
  draft: draftView,
  guestToken: z.string().min(1).optional(),
});

// GET /api/drafts/:id
export const getDraftRequest = z.object({ id: draftId });

// POST /api/drafts/:id/generate, streamed. `regenerate` keeps pins and the existing
// brief; `fill` treats manual picks as inclusion pins (architecture 6.3). Without
// `input`, the draft's held or current brief is used.
export const generateRequest = z.object({
  baseRevision,
  mode: z.enum(["generate", "regenerate", "fill"]),
  input: briefInput.optional(),
});

// POST /api/drafts/:id/refine, streamed.
export const refineRequest = z.object({
  baseRevision: revisionNumber,
  instruction: z.string().trim().min(1).max(500),
});

// POST /api/drafts/:id/ops. Null writes the first revision of a draft that has
// none, as a hand-built set's first adds do (J4). Undo, refine and share-link need
// a revision to act on, so they never take null.
export const opsRequest = z.object({
  baseRevision,
  ops: z.array(op).min(1),
});

// POST /api/drafts/:id/undo
export const undoRequest = z.object({ baseRevision: revisionNumber });

// GET /api/drafts/:id/replace-options?index=
export const replaceOptionsRequest = z.object({
  id: draftId,
  index: z.coerce.number().int().nonnegative(),
});
export const replaceOptionsResponse = z.object({
  options: z.array(performanceCard).max(3),
});

// POST /api/drafts/:id/share-link. Idempotent per (draft, revision, start index).
export const shareLinkRequest = z.object({
  baseRevision: revisionNumber,
  startIndex: z.number().int().nonnegative(),
});
export const shareLinkResponse = z.object({
  code: shareCode,
  url: z.url().startsWith("https://getmarquee.tv/s/"),
});

// GET /s/:code. The response is a 302; this is its Location header.
export const shareRedirectRequest = z.object({ code: shareCode });
export const shareRedirectResponse = z.object({
  location: z
    .url()
    .startsWith("https://www.youtube.com/watch_videos?video_ids="),
});

// GET /api/catalog/search
export const catalogSearchRequest = z.object({
  q: z.string().trim().max(200).optional(),
  publisherId: z.coerce.number().pipe(publisherId).optional(),
  seriesId: z.coerce.number().pipe(seriesId).optional(),
  artistId: z.coerce.number().pipe(artistId).optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export const catalogSearchResponse = z.object({
  performances: z.array(performanceCard),
  nextOffset: z.number().int().positive().nullable(),
});

// GET /api/catalog/artists (typeahead over names and aliases)
export const catalogArtistsRequest = z.object({
  q: z.string().trim().min(1).max(100),
});
export const catalogArtistsResponse = z.object({
  artists: z.array(
    z.object({
      id: artistId,
      name: z.string().min(1),
      // Zero means the seed has nothing playable (PRD 7.2).
      eligibleCount: z.number().int().nonnegative(),
    }),
  ),
});

// POST /api/events
export const eventsRequest = z.union([handoffEvent, analyticsEvent]);
export const eventsResponse = z.object({ ok: z.literal(true) });

// POST /api/billing/checkout returns the Stripe Checkout URL; POST /api/billing/portal
// takes nothing and returns the Customer Portal URL.
export const checkoutRequest = z.object({ plan, draftId });

// POST /api/webhooks/stripe. The signature is checked on the raw body before parsing;
// D2 parses `data.object` with Stripe's own types.
export const stripeWebhookRequest = z.object({
  id: z.string().startsWith("evt_"),
  type: z.enum([
    "checkout.session.completed",
    "invoice.paid",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});
export const stripeWebhookResponse = z.object({ received: z.literal(true) });

// GET /api/library. Enough to list a draft and hand it off again (PRD 7.7).
export const libraryResponse = z.object({
  drafts: z.array(
    z.object({
      id: draftId,
      title: z.string().nullable(),
      status: draftStatus,
      free: z.boolean(),
      revision: revisionNumber.nullable(),
      // Sum of the durations still cached; expired rows count as zero.
      runtimeS: z.number().int().nonnegative(),
      videoIds: z.array(videoId),
      updatedAt: z.iso.datetime({ offset: true }),
    }),
  ),
});

// DELETE /api/account
export const deleteAccountResponse = z.object({ deleted: z.literal(true) });

// GET /privacy, GET /terms: static HTML pages.
export const staticPageResponse = z.string().min(1);

// Every route in architecture 9.1, for tests and for anything that needs the list.
export const routes = {
  "POST /api/drafts": {
    request: createDraftRequest,
    response: createDraftResponse,
  },
  "GET /api/drafts/:id": { request: getDraftRequest, response: draftView },
  "POST /api/drafts/:id/generate": {
    request: generateRequest,
    response: streamEvent,
  },
  "POST /api/drafts/:id/refine": {
    request: refineRequest,
    response: streamEvent,
  },
  "POST /api/drafts/:id/ops": { request: opsRequest, response: draftView },
  "POST /api/drafts/:id/undo": { request: undoRequest, response: draftView },
  "GET /api/drafts/:id/replace-options": {
    request: replaceOptionsRequest,
    response: replaceOptionsResponse,
  },
  "POST /api/drafts/:id/share-link": {
    request: shareLinkRequest,
    response: shareLinkResponse,
  },
  "GET /s/:code": {
    request: shareRedirectRequest,
    response: shareRedirectResponse,
  },
  "GET /api/catalog/search": {
    request: catalogSearchRequest,
    response: catalogSearchResponse,
  },
  "GET /api/catalog/artists": {
    request: catalogArtistsRequest,
    response: catalogArtistsResponse,
  },
  "POST /api/events": { request: eventsRequest, response: eventsResponse },
  "POST /api/billing/checkout": {
    request: checkoutRequest,
    response: urlResponse,
  },
  "POST /api/billing/portal": { request: emptyRequest, response: urlResponse },
  "POST /api/webhooks/stripe": {
    request: stripeWebhookRequest,
    response: stripeWebhookResponse,
  },
  "GET /api/library": { request: emptyRequest, response: libraryResponse },
  "DELETE /api/account": {
    request: emptyRequest,
    response: deleteAccountResponse,
  },
  "GET /privacy": { request: emptyRequest, response: staticPageResponse },
  "GET /terms": { request: emptyRequest, response: staticPageResponse },
} as const;

export type CreateDraftRequest = z.infer<typeof createDraftRequest>;
export type CreateDraftResponse = z.infer<typeof createDraftResponse>;
export type GenerateRequest = z.infer<typeof generateRequest>;
export type RefineRequest = z.infer<typeof refineRequest>;
export type OpsRequest = z.infer<typeof opsRequest>;
export type UndoRequest = z.infer<typeof undoRequest>;
export type ShareLinkRequest = z.infer<typeof shareLinkRequest>;
export type ShareLinkResponse = z.infer<typeof shareLinkResponse>;
export type CatalogSearchRequest = z.infer<typeof catalogSearchRequest>;
export type CatalogSearchResponse = z.infer<typeof catalogSearchResponse>;
export type CatalogArtistsResponse = z.infer<typeof catalogArtistsResponse>;
export type EventsRequest = z.infer<typeof eventsRequest>;
export type CheckoutRequest = z.infer<typeof checkoutRequest>;
export type UrlResponse = z.infer<typeof urlResponse>;
export type LibraryResponse = z.infer<typeof libraryResponse>;
export type ReplaceOptionsResponse = z.infer<typeof replaceOptionsResponse>;
export type StripeWebhookResponse = z.infer<typeof stripeWebhookResponse>;
