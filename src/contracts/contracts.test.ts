import { describe, expect, test } from "vitest";
import { examples } from "./examples";
import { routes, schemas } from "./index";

// One invalid example per schema, each breaking one rule the schema holds.
const invalid: Record<keyof typeof schemas, unknown> = {
  owner: { kind: "guest", userId: examples.owner.guestId },
  performanceCard: { ...examples.performanceCard, videoId: "too-short" },
  briefInput: {
    ...examples.briefInput,
    seeds: [{ name: "Radiohead", mustInclude: true }],
  },
  brief: {
    ...examples.brief,
    curve: [{ from_min: 40, to_min: 10, energy: 2 }],
  },
  refineBrief: { delta: {}, scope: { from_index: 9, to_index: 2 } },
  revisionItem: { ...examples.revisionItem, pinned: "locked" },
  revision: { ...examples.revision, number: 0 },
  op: { op: "rename" },
  curatorOp: { op: "pin", performance_id: 102 },
  draftView: { ...examples.draftView, flags: { handoffMode: "api" } },
  candidateRow: { ...examples.candidateRow, artist_energy: 6 },
  composeOutput: { ...examples.composeOutput, ids: [] },
  refineOutput: { ops: [{ op: "unpin", performance_id: 101 }] },
  curatorWarning: { code: "seed_unavailable" },
  curatorProposal: { ...examples.curatorProposal, trigger: "edit" },
  streamEvent: { type: "error", code: "timeout" },
  handoffEvent: { ...examples.handoffEvent, part: 0 },
  analyticsEvent: { name: "page_scrolled" },
  errorBody: { error: "conflict" },
  emptyRequest: { draftId: examples.getDraftRequest.id },
  createDraftRequest: { creationMethod: "voice" },
  createDraftResponse: { guestToken: "q3Zt8vK1xWm0pR7nYc2bLg" },
  getDraftRequest: { id: "not-a-uuid" },
  generateRequest: { ...examples.generateRequest, mode: "remix" },
  refineRequest: { baseRevision: 3, instruction: "   " },
  opsRequest: { baseRevision: 3, ops: [] },
  undoRequest: {},
  replaceOptionsRequest: { id: examples.getDraftRequest.id, index: "-1" },
  replaceOptionsResponse: { options: Array(4).fill(examples.performanceCard) },
  shareLinkRequest: { baseRevision: 3, startIndex: -1 },
  shareLinkResponse: { code: "k7Qm2x", url: "https://evil.example/s/k7Qm2x" },
  shareRedirectRequest: { code: "../etc" },
  shareRedirectResponse: {
    location: "https://www.youtube.com/watch?v=ferZnZ0_rSM",
  },
  catalogSearchRequest: { artistId: "abc" },
  catalogSearchResponse: { performances: [], nextOffset: 0 },
  catalogArtistsRequest: { q: "" },
  catalogArtistsResponse: {
    artists: [{ id: 7, name: "Khruangbin", eligibleCount: -1 }],
  },
  eventsRequest: {
    name: "handoff_opened",
    draftId: examples.getDraftRequest.id,
  },
  eventsResponse: { ok: false },
  checkoutRequest: { plan: "annual", draftId: examples.getDraftRequest.id },
  urlResponse: { url: "http://checkout.stripe.com/c/pay/cs_test_a1b2c3" },
  stripeWebhookRequest: {
    ...examples.stripeWebhookRequest,
    type: "charge.refunded",
  },
  stripeWebhookResponse: {},
  libraryResponse: {
    drafts: [{ ...examples.libraryResponse.drafts[0], videoIds: ["x"] }],
  },
  deleteAccountResponse: { deleted: false },
  staticPageResponse: "",
};

describe("contracts", () => {
  test("every schema has a valid and an invalid example", () => {
    expect(Object.keys(examples).sort()).toEqual(Object.keys(schemas).sort());
    expect(Object.keys(invalid).sort()).toEqual(Object.keys(schemas).sort());
  });

  test.each(Object.keys(schemas) as (keyof typeof schemas)[])("%s", (name) => {
    const schema = schemas[name];
    const valid = schema.safeParse(examples[name]);
    expect(valid.error).toBeUndefined();
    expect(schema.safeParse(invalid[name]).success).toBe(false);
  });

  test("every route in architecture 9.1 has a request and a response schema", () => {
    expect(Object.keys(routes)).toEqual([
      "POST /api/drafts",
      "GET /api/drafts/:id",
      "POST /api/drafts/:id/generate",
      "POST /api/drafts/:id/refine",
      "POST /api/drafts/:id/ops",
      "POST /api/drafts/:id/undo",
      "GET /api/drafts/:id/replace-options",
      "POST /api/drafts/:id/share-link",
      "GET /s/:code",
      "GET /api/catalog/search",
      "GET /api/catalog/artists",
      "POST /api/events",
      "POST /api/billing/checkout",
      "POST /api/billing/portal",
      "POST /api/webhooks/stripe",
      "GET /api/library",
      "DELETE /api/account",
      "GET /privacy",
      "GET /terms",
    ]);
    const named = new Set<unknown>(Object.values(schemas));
    for (const [route, { request, response }] of Object.entries(routes)) {
      expect(named.has(request), `${route} request`).toBe(true);
      expect(named.has(response), `${route} response`).toBe(true);
    }
  });
});
