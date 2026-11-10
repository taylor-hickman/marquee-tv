import { expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  createDraftResponse,
  draftView,
  streamEvent,
  type CreateDraftRequest,
  type DraftView,
  type Op,
  type StreamEvent,
} from "@/contracts";
import { examples } from "@/contracts/examples";

// Seeded catalog rows (db/fixtures/catalog.json), with their lengths.
export const MAC = { id: 1, name: "Mac Miller", durationS: 1126 };
export const TYLER = { id: 2, name: "Tyler, The Creator", durationS: 1403 };
export const BILLIE = { id: 3, name: "Billie Eilish", durationS: 1354 };
export const MITSKI = { id: 4, name: "Mitski", durationS: 910 };
export const JAPANESE_BREAKFAST = {
  id: 5,
  name: "Japanese Breakfast",
  durationS: 877,
};

// One guest per worker: the local stack allows ten new guests an hour per IP.
export type Guest = { token: string; headers: Record<string, string> };

export async function newGuest(request: APIRequestContext): Promise<Guest> {
  const response = await request.post("/api/drafts", {
    data: { creationMethod: "manual" },
  });
  const { guestToken } = createDraftResponse.parse(await response.json());
  return { token: guestToken!, headers: { "x-guest-token": guestToken! } };
}

export async function createDraft(
  request: APIRequestContext,
  guest: Guest,
  body: CreateDraftRequest,
): Promise<string> {
  const response = await request.post("/api/drafts", {
    headers: guest.headers,
    data: body,
  });
  expect(response.status()).toBe(201);
  return createDraftResponse.parse(await response.json()).draft.draft.id;
}

export async function writeOps(
  request: APIRequestContext,
  guest: Guest,
  id: string,
  baseRevision: number | null,
  ops: Op[],
): Promise<DraftView> {
  const response = await request.post(`/api/drafts/${id}/ops`, {
    headers: guest.headers,
    data: { baseRevision, ops },
  });
  expect(response.ok()).toBe(true);
  return draftView.parse(await response.json());
}

export async function readDraft(
  request: APIRequestContext,
  guest: Guest,
  id: string,
): Promise<DraftView> {
  const response = await request.get(`/api/drafts/${id}`, {
    headers: guest.headers,
  });
  expect(response.ok()).toBe(true);
  return draftView.parse(await response.json());
}

// A hand-built draft with the given picks as its first revision.
export async function draftWith(
  request: APIRequestContext,
  guest: Guest,
  ids: number[],
): Promise<string> {
  const id = await createDraft(request, guest, { creationMethod: "manual" });
  await writeOps(
    request,
    guest,
    id,
    null,
    ids.map((performance_id) => ({ op: "add", performance_id })),
  );
  return id;
}

// Opens the editor as this guest. The PR gate reaches no third party, so
// thumbnails stay placeholders.
export async function openEditor(page: Page, guest: Guest, path: string) {
  await page.route("https://i.ytimg.com/**", (route) => route.abort());
  await page.addInitScript((token) => {
    localStorage.setItem("guest_token", token);
  }, guest.token);
  await page.goto(path);
}

export const trackList = (page: Page) =>
  page.getByRole("list", { name: /performances?$/ });

export const row = (page: Page, name: string) =>
  trackList(page).getByRole("listitem").filter({ hasText: name });

// A generate stream as C2's route sends it, one JSON event per line, built
// from the contract examples so a contract change breaks the mock too.
export function stream(events: StreamEvent[]): string {
  return events.map((e) => JSON.stringify(streamEvent.parse(e))).join("\n");
}

export const started: StreamEvent = {
  type: "started",
  runId: "6a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
};
export const briefEcho = (echo: string) =>
  streamEvent.parse({ type: "brief", brief: examples.brief, echo });
