import type { z } from "zod";
import { auth } from "@/app/auth/supabase";
import {
  accountResponse,
  catalogArtistsResponse,
  catalogSearchResponse,
  createDraftResponse,
  deleteAccountResponse,
  draftView,
  errorBody,
  eventsResponse,
  libraryResponse,
  replaceOptionsResponse,
  shareLinkResponse,
  streamEvent,
  urlResponse,
  type ApiResult,
  type CatalogSearchRequest,
  type CheckoutRequest,
  type CreateDraftRequest,
  type DraftId,
  type EventsRequest,
  type GenerateRequest,
  type OpsRequest,
  type RefineRequest,
  type ShareLinkRequest,
  type StreamEvent,
  type UndoRequest,
} from "@/contracts";
import { getGuestToken, setGuestToken } from "./storage";

// The browser's side of architecture 9.1. Every call returns the contracts'
// ApiResult: a parsed body, or the parsed error body the route sent. A body
// that matches neither throws, since client and server disagree on a contract.

// Same header src/lib/auth reads; that module is server-only.
const GUEST_TOKEN_HEADER = "x-guest-token";

export type ApiClientOptions = {
  fetch?: typeof fetch;
  // The signed-in user's Supabase access token, or null for a guest.
  getAccessToken?: () => Promise<string | null>;
};

// The browser's Supabase session, when someone is signed in. Every screen
// sends it, so a claimed or paid draft opens for its user (J7, J8).
export async function accessToken(): Promise<string | null> {
  try {
    const { data } = await auth().getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

type Method = "GET" | "POST" | "DELETE";

export function createApiClient({
  fetch: send = (...args) => fetch(...args),
  getAccessToken = accessToken,
}: ApiClientOptions = {}) {
  async function call(method: Method, path: string, body?: unknown) {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const guestToken = getGuestToken();
    if (guestToken) headers[GUEST_TOKEN_HEADER] = guestToken;
    const token = await getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
    return send(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function failure(
    path: string,
    response: Response,
  ): Promise<{ ok: false; error: z.infer<typeof errorBody> }> {
    const parsed = errorBody.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new Error(`${path}: unexpected ${response.status}`);
    }
    return { ok: false, error: parsed.data };
  }

  async function json<S extends z.ZodType>(
    schema: S,
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<z.infer<S>>> {
    const response = await call(method, path, body);
    if (!response.ok) return failure(path, response);
    return { ok: true, value: schema.parse(await response.json()) };
  }

  // Generate and refine answer with one JSON stream event per line.
  async function stream(
    path: string,
    body: unknown,
  ): Promise<ApiResult<AsyncIterable<StreamEvent>>> {
    const response = await call("POST", path, body);
    if (!response.ok) return failure(path, response);
    return { ok: true, value: streamEvents(response) };
  }

  const draft = (id: DraftId) => `/api/drafts/${encodeURIComponent(id)}`;

  return {
    async createDraft(body: CreateDraftRequest) {
      const result = await json(
        createDraftResponse,
        "POST",
        "/api/drafts",
        body,
      );
      if (result.ok && result.value.guestToken) {
        setGuestToken(result.value.guestToken);
      }
      return result;
    },
    getDraft: (id: DraftId) => json(draftView, "GET", draft(id)),
    generate: (id: DraftId, body: GenerateRequest) =>
      stream(`${draft(id)}/generate`, body),
    refine: (id: DraftId, body: RefineRequest) =>
      stream(`${draft(id)}/refine`, body),
    ops: (id: DraftId, body: OpsRequest) =>
      json(draftView, "POST", `${draft(id)}/ops`, body),
    undo: (id: DraftId, body: UndoRequest) =>
      json(draftView, "POST", `${draft(id)}/undo`, body),
    replaceOptions: (id: DraftId, index: number) =>
      json(
        replaceOptionsResponse,
        "GET",
        `${draft(id)}/replace-options?index=${index}`,
      ),
    shareLink: (id: DraftId, body: ShareLinkRequest) =>
      json(shareLinkResponse, "POST", `${draft(id)}/share-link`, body),
    searchCatalog: (query: Partial<CatalogSearchRequest>) =>
      json(catalogSearchResponse, "GET", `/api/catalog/search${qs(query)}`),
    searchArtists: (q: string) =>
      json(catalogArtistsResponse, "GET", `/api/catalog/artists${qs({ q })}`),
    sendEvent: (body: EventsRequest) =>
      json(eventsResponse, "POST", "/api/events", body),
    checkout: (body: CheckoutRequest) =>
      json(urlResponse, "POST", "/api/billing/checkout", body),
    billingPortal: () => json(urlResponse, "POST", "/api/billing/portal", {}),
    library: () => json(libraryResponse, "GET", "/api/library"),
    account: () => json(accountResponse, "GET", "/api/account"),
    deleteAccount: () => json(deleteAccountResponse, "DELETE", "/api/account"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

async function* streamEvents(response: Response): AsyncIterable<StreamEvent> {
  if (!response.body) return;
  // Safari has no async iteration over a ReadableStream; read it by hand.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield streamEvent.parse(JSON.parse(line));
    }
  }
  buffered += decoder.decode();
  if (buffered.trim()) yield streamEvent.parse(JSON.parse(buffered));
}
