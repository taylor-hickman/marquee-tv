import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  draftView,
  errorBody,
  streamEvent,
  type DraftView,
  type ErrorBody,
} from "@/contracts";
import { examples } from "@/contracts/examples";
import { createApiClient } from "./api";
import { createDraftState } from "./draft-state";
import { getDraftCache, getGuestToken, setGuestToken } from "./storage";
import { memoryStorage } from "./testing";

const local = draftView.parse(examples.draftView);
const id = local.draft.id;
const at = (number: number): DraftView => ({
  ...local,
  revision: { ...local.revision!, number },
});

type Call = { url: string; init: RequestInit };

function fakeFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = responses.shift();
      if (!next) throw new Error("no response queued");
      return next;
    },
  );
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const fail = (body: ErrorBody, status: number) =>
  Response.json(errorBody.parse(body), { status });

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("requests", () => {
  test("send the stored guest token and a JSON body", async () => {
    setGuestToken("guest-1");
    const { fetch, calls } = fakeFetch(Response.json(at(4)));
    const api = createApiClient({ fetch });

    const result = await api.ops(id, {
      baseRevision: 3,
      ops: [{ op: "pin", performance_id: 101 }],
    });

    expect(result).toEqual({ ok: true, value: at(4) });
    expect(calls[0].url).toBe(`/api/drafts/${id}/ops`);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toEqual({
      "content-type": "application/json",
      "x-guest-token": "guest-1",
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      baseRevision: 3,
      ops: [{ op: "pin", performance_id: 101 }],
    });
  });

  test("send a signed-in user's access token as a bearer", async () => {
    const { fetch, calls } = fakeFetch(Response.json(examples.libraryResponse));
    const api = createApiClient({
      fetch,
      getAccessToken: async () => "jwt-1",
    });

    expect((await api.library()).ok).toBe(true);
    expect(calls[0].init.headers).toEqual({ authorization: "Bearer jwt-1" });
  });

  test("build the query string from defined params only", async () => {
    const { fetch, calls } = fakeFetch(
      Response.json(examples.catalogSearchResponse),
    );
    await createApiClient({ fetch }).searchCatalog({
      q: "tiny desk",
      offset: 20,
    });
    expect(calls[0].url).toBe("/api/catalog/search?q=tiny+desk&offset=20");
  });

  test("creating a draft keeps the guest token the server issued", async () => {
    const { fetch } = fakeFetch(
      Response.json({ ...examples.createDraftResponse, guestToken: "new-1" }),
    );
    await createApiClient({ fetch }).createDraft({ creationMethod: "typed" });
    expect(getGuestToken()).toBe("new-1");
  });
});

describe("errors", () => {
  test("come back as the parsed error body", async () => {
    const { fetch } = fakeFetch(
      fail({ error: "payment_required", defaultPlan: "session_pass" }, 402),
    );
    const result = await createApiClient({ fetch }).undo(id, {
      baseRevision: 3,
    });
    expect(result).toEqual({
      ok: false,
      error: { error: "payment_required", defaultPlan: "session_pass" },
    });
  });

  test("throw when the body matches no contract", async () => {
    const { fetch } = fakeFetch(new Response("<html>", { status: 500 }));
    await expect(createApiClient({ fetch }).getDraft(id)).rejects.toThrow(
      `/api/drafts/${id}: unexpected 500`,
    );
  });
});

describe("streams", () => {
  test("yield one parsed event per line, across chunk boundaries", async () => {
    const events = [
      { type: "started", runId: "5c1d3e2f-4a6b-4c8d-9e0f-1a2b3c4d5e6f" },
      { type: "candidates", count: 42 },
      { type: "result", draft: at(4), warnings: [] },
    ].map((e) => streamEvent.parse(e));
    const text = events.map((e) => JSON.stringify(e)).join("\n");
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) {
          controller.enqueue(bytes.slice(i, i + 7));
        }
        controller.close();
      },
    });
    const { fetch } = fakeFetch(new Response(body));

    const result = await createApiClient({ fetch }).generate(id, {
      baseRevision: 3,
      mode: "regenerate",
    });
    if (!result.ok) throw new Error("expected a stream");
    const seen = [];
    for await (const event of result.value) seen.push(event);
    expect(seen).toEqual(events);
  });
});

describe("baseRevision", () => {
  test("every write carries the revision on screen", async () => {
    const { fetch, calls } = fakeFetch(Response.json(at(4)));
    const api = createApiClient({ fetch });
    const state = createDraftState(at(3));

    await state.write((baseRevision) =>
      api.ops(id, {
        baseRevision,
        ops: [{ op: "unpin", performance_id: 101 }],
      }),
    );

    expect(JSON.parse(String(calls[0].init.body)).baseRevision).toBe(3);
    expect(state.get()).toEqual(at(4));
  });

  test("a 409 replaces local state with the current draft and re-renders", async () => {
    const { fetch } = fakeFetch(
      fail({ error: "conflict", current: at(7) }, 409),
    );
    const api = createApiClient({ fetch });
    const state = createDraftState(at(3));
    const render = vi.fn();
    state.subscribe(render);

    const result = await state.write((baseRevision) =>
      api.ops(id, { baseRevision, ops: [{ op: "pin", performance_id: 101 }] }),
    );

    expect(result.ok).toBe(false);
    expect(state.get()).toEqual(at(7));
    expect(render).toHaveBeenCalledTimes(1);
    expect(getDraftCache()).toEqual(at(7));
  });

  test("a 409 on a stream also replaces local state", async () => {
    const { fetch } = fakeFetch(
      fail({ error: "conflict", current: at(5) }, 409),
    );
    const api = createApiClient({ fetch });
    const state = createDraftState(at(3));

    const result = await state.send((baseRevision) =>
      api.generate(id, { baseRevision, mode: "regenerate" }),
    );

    expect(result.ok).toBe(false);
    expect(state.get()).toEqual(at(5));
  });

  test("other errors leave local state alone", async () => {
    const { fetch } = fakeFetch(fail({ error: "read_only" }, 403));
    const api = createApiClient({ fetch });
    const state = createDraftState(at(3));

    await state.write((baseRevision) =>
      api.ops(id, { baseRevision, ops: [{ op: "pin", performance_id: 101 }] }),
    );

    expect(state.get()).toEqual(at(3));
    expect(getDraftCache()).toBeNull();
  });
});
