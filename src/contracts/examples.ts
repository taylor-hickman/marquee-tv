import type { z } from "zod";
import type { schemas } from "./index";

// One valid example per schema in `schemas`, for tests and for UI mocks
// (build plan 6.1): an e2e spec that mocks a route builds its body from here and
// parses it with the schema, so a contract change breaks the mock with the route.

const DRAFT_ID = "3f0c6a52-8a7e-4c3e-9a51-0d6f3b8f2c11";
const GUEST_ID = "9b2d4e6f-1a3c-4b5d-8e7f-2a4c6e8b0d13";

const performanceCard = {
  id: 101,
  videoId: "ferZnZ0_rSM",
  title: "Khruangbin: Tiny Desk Concert",
  artists: [{ id: 7, name: "Khruangbin" }],
  publisher: { id: 1, name: "NPR Music" },
  series: { id: 2, name: "Tiny Desk Concerts" },
  durationS: 1080,
  publishedAt: "2024-03-14T16:00:00Z",
} satisfies z.input<typeof schemas.performanceCard>;

const briefInput = {
  text: "Warm and slow to start, dancing by the end",
  mood: "friends_over",
  durationS: 7200,
  seeds: [
    { artistId: 7, name: "Khruangbin", mustInclude: true },
    { name: "Radiohead", mustInclude: false },
  ],
} satisfies z.input<typeof schemas.briefInput>;

const brief = {
  curve: [
    { from_min: 0, to_min: 40, energy: 2 },
    { from_min: 40, to_min: 90, energy: 3 },
    { from_min: 90, to_min: 120, energy: 4 },
  ],
  genres: ["psychedelic soul", "funk"],
  scenes: ["houston"],
  seeds: [{ artist_id: 7, must_include: true }],
  influences: [
    { name: "Radiohead", genres: ["art rock"], scenes: ["oxford"], energy: 3 },
  ],
  series_include: [],
  series_exclude: [5],
  novelty: "default",
  surprise: false,
  exclusions: { artist_ids: [], publisher_ids: [] },
  duration_s: 7200,
} satisfies z.input<typeof schemas.brief>;

const revisionItem = {
  performance_id: 101,
  pinned: "position",
  source: "seed",
} satisfies z.input<typeof schemas.revisionItem>;

const revision = {
  number: 3,
  items: [revisionItem, { performance_id: 102, pinned: "none", source: "ai" }],
  removedIds: [103],
  brief,
  trigger: "refine",
  instruction: "funkier in the second half",
  createdAt: "2026-11-09T18:30:00Z",
} satisfies z.input<typeof schemas.revision>;

const draftView = {
  draft: {
    id: DRAFT_ID,
    title: "Slow burn to the dance floor",
    description: "Starts warm and unhurried, ends on its feet",
    status: "active",
    free: true,
    creationMethod: "typed",
    durationTargetS: 7200,
  },
  revision,
  performances: [
    performanceCard,
    {
      ...performanceCard,
      id: 102,
      videoId: "Ow4aFqRdlbI",
      title: "Hiatus Kaiyote | KEXP",
      artists: [{ id: 8, name: "Hiatus Kaiyote" }],
      publisher: { id: 3, name: "KEXP" },
      series: { id: 4, name: "KEXP Live" },
    },
  ],
  flags: { handoffMode: "url" },
  entitlement: { state: "free", runsLeft: 22 },
} satisfies z.input<typeof schemas.draftView>;

const curatorWarning = {
  code: "duration_out_of_range",
  target_s: 7200,
  actual_s: 6000,
} satisfies z.input<typeof schemas.curatorWarning>;

export const examples = {
  owner: { kind: "guest", guestId: GUEST_ID },
  performanceCard,
  briefInput,
  brief,
  refineBrief: {
    delta: { curve: [{ from_min: 60, to_min: 120, energy: 4 }] },
    scope: { from_index: 8, to_index: 15 },
  },
  revisionItem,
  revision,
  op: { op: "move", performance_id: 102, to_index: 0 },
  curatorOp: { op: "replace", performance_id: 102, with_performance_id: 104 },
  draftView,
  candidateRow: {
    id: 104,
    artist: "Vulfpeck",
    series: "Live from Here",
    duration_s: 1320,
    artist_energy: 4,
    genres: ["funk"],
  },
  composeOutput: {
    ids: [101, 102],
    title: "Slow burn to the dance floor",
    arc: "Starts warm and unhurried, ends on its feet",
  },
  refineOutput: {
    ops: [
      { op: "remove", performance_id: 102 },
      { op: "add", performance_id: 104, index: 1 },
    ],
  },
  curatorWarning,
  curatorProposal: {
    trigger: "generate",
    items: revision.items,
    removedIds: [],
    brief,
    title: "Slow burn to the dance floor",
    description: "Starts warm and unhurried, ends on its feet",
    warnings: [curatorWarning],
    run: {
      candidateIds: [101, 102, 104],
      outputIds: [101, 102],
      droppedIds: [999],
      model: "claude-sonnet-5-5",
      tokensIn: 5480,
      tokensOut: 390,
      latencyMs: 4100,
    },
  },
  streamEvent: { type: "result", draft: draftView, warnings: [] },
  handoffEvent: {
    name: "handoff_opened",
    draftId: DRAFT_ID,
    revision: 3,
    part: 1,
    startIndex: 0,
    surface: "desktop",
  },
  analyticsEvent: { name: "landing_viewed", props: { returning: false } },
  errorBody: { error: "payment_required", defaultPlan: "session_pass" },
  emptyRequest: {},
  createDraftRequest: { creationMethod: "typed", input: briefInput },
  createDraftResponse: {
    draft: { ...draftView, revision: null },
    guestToken: "q3Zt8vK1xWm0pR7nYc2bLg",
  },
  getDraftRequest: { id: DRAFT_ID },
  generateRequest: { baseRevision: null, mode: "generate", input: briefInput },
  refineRequest: { baseRevision: 3, instruction: "funkier in the second half" },
  opsRequest: {
    baseRevision: 3,
    ops: [
      { op: "pin", performance_id: 102 },
      { op: "rename", title: "Sunday set" },
    ],
  },
  undoRequest: { baseRevision: 3 },
  replaceOptionsRequest: { id: DRAFT_ID, index: "4" },
  replaceOptionsResponse: { options: [performanceCard] },
  shareLinkRequest: { baseRevision: 3, startIndex: 0 },
  shareLinkResponse: { code: "k7Qm2x", url: "https://getmarquee.tv/s/k7Qm2x" },
  shareRedirectRequest: { code: "k7Qm2x" },
  shareRedirectResponse: {
    location:
      "https://www.youtube.com/watch_videos?video_ids=ferZnZ0_rSM,Ow4aFqRdlbI",
  },
  catalogSearchRequest: { q: "tiny desk", publisherId: "1", offset: "0" },
  catalogSearchResponse: { performances: [performanceCard], nextOffset: 24 },
  catalogArtistsRequest: { q: "khru" },
  catalogArtistsResponse: {
    artists: [
      { id: 7, name: "Khruangbin", eligibleCount: 3 },
      {
        id: 8,
        name: "Khruangbin & Leon Bridges",
        eligibleCount: 0,
        closest: [{ id: 7, name: "Khruangbin", eligibleCount: 3 }],
      },
    ],
  },
  eventsRequest: {
    name: "brief_submitted",
    draftId: DRAFT_ID,
    props: { entry: "chip" },
  },
  eventsResponse: { ok: true },
  signInResponse: {
    redirectTo:
      "https://getmarquee.tv/auth/callback?claim=Vb3nQ8sK2yTf1mXc6rJp0w",
  },
  sessionResponse: { userId: "8d2e4f6a-1b3c-4d5e-9f70-a1b2c3d4e5f6" },
  checkoutRequest: { plan: "session_pass", draftId: DRAFT_ID },
  urlResponse: { url: "https://checkout.stripe.com/c/pay/cs_test_a1b2c3" },
  stripeWebhookRequest: {
    id: "evt_1Q2w3E4r5T6y",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_a1b2c3", mode: "payment" } },
  },
  stripeWebhookResponse: { received: true },
  libraryResponse: {
    drafts: [
      {
        id: DRAFT_ID,
        title: "Slow burn to the dance floor",
        status: "active",
        free: true,
        revision: 3,
        runtimeS: 7020,
        videoIds: ["ferZnZ0_rSM", "Ow4aFqRdlbI"],
        updatedAt: "2026-11-09T18:30:00Z",
      },
    ],
  },
  deleteAccountResponse: { deleted: true },
  staticPageResponse: "<!doctype html><title>Privacy</title>",
} satisfies { [K in keyof typeof schemas]: z.input<(typeof schemas)[K]> };
