// Shapes shared by client and server (architecture 9.1). Safe to import from either.
import * as api from "./api";
import { brief, briefInput, refineBrief } from "./brief";
import { owner, performanceCard } from "./common";
import {
  candidateRow,
  composeOutput,
  curatorProposal,
  curatorWarning,
  refineOutput,
} from "./curator";
import { curatorOp, draftView, op, revision, revisionItem } from "./draft";
import { analyticsEvent, handoffEvent } from "./events";
import { streamEvent } from "./stream";

export * from "./api";
export * from "./brief";
export * from "./common";
export * from "./curator";
export * from "./draft";
export * from "./events";
export * from "./not-implemented";
export * from "./stream";

// Every named schema. examples.ts holds one valid example for each key, and the
// contract test one invalid example for each.
export const schemas = {
  owner,
  performanceCard,
  briefInput,
  brief,
  refineBrief,
  revisionItem,
  revision,
  op,
  curatorOp,
  draftView,
  candidateRow,
  composeOutput,
  refineOutput,
  curatorWarning,
  curatorProposal,
  streamEvent,
  handoffEvent,
  analyticsEvent,
  errorBody: api.errorBody,
  emptyRequest: api.emptyRequest,
  createDraftRequest: api.createDraftRequest,
  createDraftResponse: api.createDraftResponse,
  getDraftRequest: api.getDraftRequest,
  generateRequest: api.generateRequest,
  refineRequest: api.refineRequest,
  opsRequest: api.opsRequest,
  undoRequest: api.undoRequest,
  replaceOptionsRequest: api.replaceOptionsRequest,
  replaceOptionsResponse: api.replaceOptionsResponse,
  shareLinkRequest: api.shareLinkRequest,
  shareLinkResponse: api.shareLinkResponse,
  shareRedirectRequest: api.shareRedirectRequest,
  shareRedirectResponse: api.shareRedirectResponse,
  catalogSearchRequest: api.catalogSearchRequest,
  catalogSearchResponse: api.catalogSearchResponse,
  catalogArtistsRequest: api.catalogArtistsRequest,
  catalogArtistsResponse: api.catalogArtistsResponse,
  eventsRequest: api.eventsRequest,
  eventsResponse: api.eventsResponse,
  signInResponse: api.signInResponse,
  sessionRequest: api.sessionRequest,
  sessionResponse: api.sessionResponse,
  checkoutRequest: api.checkoutRequest,
  urlResponse: api.urlResponse,
  stripeWebhookRequest: api.stripeWebhookRequest,
  stripeWebhookResponse: api.stripeWebhookResponse,
  libraryResponse: api.libraryResponse,
  accountResponse: api.accountResponse,
  deleteAccountResponse: api.deleteAccountResponse,
  staticPageResponse: api.staticPageResponse,
  youtubeConnectRequest: api.youtubeConnectRequest,
  youtubeCallbackRequest: api.youtubeCallbackRequest,
  youtubeCallbackResponse: api.youtubeCallbackResponse,
  youtubeConnectionResponse: api.youtubeConnectionResponse,
  youtubeExportRequest: api.youtubeExportRequest,
  youtubeExportResponse: api.youtubeExportResponse,
};
