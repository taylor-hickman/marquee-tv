import { sql } from "@/test/db";
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  type BriefInput,
  draftView,
  errorBody,
  type StreamEvent,
  streamEvent,
} from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import * as playlist from "@/modules/playlist";
import { aiItem, catalogIds, draftAt } from "@/modules/playlist/testing";
import * as factories from "@/test/factories";
import { POST as postOps } from "../ops/route";
import { POST } from "./route";
import { background, heldBrief, llm, resetLlm, settle } from "./testing";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/curator/llm", async (importOriginal) =>
  (await import("./testing")).mockLlm(await importOriginal()),
);
vi.mock("next/server", async (importOriginal) => {
  const { background } = await import("./testing");
  return {
    ...(await importOriginal<object>()),
    after: (run: Promise<unknown>) => background.push(run),
  };
});

const input: BriefInput = { text: "warm soul", durationS: 3600, seeds: [] };

// Each request comes from its own address, so the per-IP run limit counts only
// what a test sets up.
const post = (id: string, body: unknown, headers: Record<string, string>) =>
  POST(
    new Request(`http://localhost/api/drafts/${id}/generate`, {
      method: "POST",
      headers: { ...headers, "x-forwarded-for": randomUUID() },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const read = async (response: Response): Promise<StreamEvent[]> =>
  (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => streamEvent.parse(JSON.parse(line)));

const draftRow = async (id: string) =>
  (
    await sql`select free, status, current_revision, held_input, title
      from playlist_draft where id = ${id}`
  )[0];

const runs = (id: string) =>
  sql`select id, kind, error from curator_run where draft_id = ${id}`;

// `n` runs on a draft, `ago` before now.
const pastRuns = (draftId: string, n: number, ago = "2 hours") =>
  sql`insert into curator_run (draft_id, kind, created_at)
      select ${draftId}, 'generate', now() - ${ago}::interval
      from generate_series(1, ${n})`;

const defaultPlanOf = async (guestId: string) => {
  const [{ cohort }] =
    await sql`select cohort from guest where id = ${guestId}`;
  return cohort === "sub_first" ? "subscription" : "session_pass";
};

let ids: number[];

beforeAll(async () => {
  ids = await catalogIds(4);
});

afterEach(async () => {
  await settle();
  resetLlm();
});

describe("POST /api/drafts/:id/generate", () => {
  test("a guest's first model-backed draft becomes free and streams the run", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
      creation_method: "typed",
    });

    const response = await post(
      draft.id,
      { baseRevision: null, mode: "generate", input },
      guest.headers,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    const events = await read(response);
    expect(events.map((e) => e.type)).toEqual([
      "started",
      "brief",
      "candidates",
      "result",
    ]);
    const result = events.at(-1) as Extract<StreamEvent, { type: "result" }>;
    expect(result.draft.draft).toMatchObject({
      free: true,
      title: "Warm room",
    });
    expect(result.draft.revision).toMatchObject({
      number: 1,
      trigger: "generate",
    });
    expect(result.draft.revision!.items.length).toBeGreaterThan(0);

    await settle();
    const runId = (events[0] as { runId: string }).runId;
    expect(await runs(draft.id)).toEqual([
      { id: runId, kind: "generate", error: null },
    ]);
    const [revision] = await sql`
      select curator_run_id from playlist_revision where draft_id = ${draft.id}`;
    expect(revision.curator_run_id).toBe(runId);
    expect(await draftRow(draft.id)).toMatchObject({
      free: true,
      current_revision: 1,
    });
  });

  test("rule 3: a guest's second model-backed draft gets 402, awaiting_payment and the brief held", async () => {
    const guest = await asGuest();
    await draftAt(ids, { owner_guest_id: guest.guestId, free: true });
    const second = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
    });

    const response = await post(
      second.id,
      { baseRevision: null, mode: "generate", input },
      guest.headers,
    );
    expect(response.status).toBe(402);
    expect(errorBody.parse(await response.json())).toEqual({
      error: "payment_required",
      defaultPlan: await defaultPlanOf(guest.guestId),
    });
    expect(await draftRow(second.id)).toMatchObject({
      free: false,
      status: "awaiting_payment",
      held_input: input,
      current_revision: null,
    });
    expect(await runs(second.id)).toEqual([]);
    expect(llm.calls).toEqual([]);
  });

  test("a pass holder runs the held brief on their pass's draft", async () => {
    const user = await asUser();
    await factories.playlistDraft({ owner_user_id: user.userId, free: true });
    const held = { ...input, durationS: 1800 };
    const draft = await factories.playlistDraft({
      owner_user_id: user.userId,
      creation_method: "typed",
      status: "awaiting_payment",
      held_input: sql.json(held),
    });
    const pass = await factories.entitlement({
      user_id: user.userId,
      kind: "session_pass",
      period_end: new Date(Date.now() + 86_400_000),
      draft_id: draft.id,
    });
    await sql`update playlist_draft set status = 'active',
      entitlement_id = ${pass.id} where id = ${draft.id}`;

    const response = await post(
      draft.id,
      { baseRevision: null, mode: "generate" },
      user.headers,
    );
    expect(response.status).toBe(200);
    const result = (await read(response)).at(-1)!;
    expect(result.type).toBe("result");
    const view = (result as Extract<StreamEvent, { type: "result" }>).draft;
    expect(view.revision!.brief!.duration_s).toBe(1800);
    expect(view.entitlement.state).toBe("pass");
    await settle();
    expect(await draftRow(draft.id)).toMatchObject({
      held_input: null,
      free: false,
      current_revision: 1,
    });
  });

  test("rule 3: a pass holder off their pass's draft gets 402", async () => {
    const user = await asUser();
    await factories.playlistDraft({ owner_user_id: user.userId, free: true });
    const passDraft = await factories.playlistDraft({
      owner_user_id: user.userId,
    });
    const pass = await factories.entitlement({
      user_id: user.userId,
      kind: "session_pass",
      period_end: new Date(Date.now() + 86_400_000),
      draft_id: passDraft.id,
    });
    await sql`update playlist_draft set entitlement_id = ${pass.id}
      where id = ${passDraft.id}`;
    const other = await factories.playlistDraft({ owner_user_id: user.userId });

    const response = await post(
      other.id,
      { baseRevision: null, mode: "generate", input },
      user.headers,
    );
    expect(response.status).toBe(402);
    expect(await draftRow(other.id)).toMatchObject({
      status: "awaiting_payment",
    });
    expect(llm.calls).toEqual([]);
  });

  test("a subscriber runs the curator on any of their drafts", async () => {
    const user = await asUser();
    await factories.playlistDraft({ owner_user_id: user.userId, free: true });
    await factories.entitlement({
      user_id: user.userId,
      kind: "subscription",
      status: "active",
    });
    const draft = await factories.playlistDraft({
      owner_user_id: user.userId,
      creation_method: "typed",
    });

    const response = await post(
      draft.id,
      { baseRevision: null, mode: "generate", input },
      user.headers,
    );
    expect(response.status).toBe(200);
    const result = (await read(response)).at(-1)!;
    expect(result.type).toBe("result");
    await settle();
    expect(await draftRow(draft.id)).toMatchObject({
      free: false,
      status: "active",
      current_revision: 1,
    });
  });

  test("past 25 runs the draft gets run_cap_reached and manual edits still work", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      free: true,
    });
    await pastRuns(id, 25);

    const response = await post(
      id,
      { baseRevision: 1, mode: "regenerate" },
      guest.headers,
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "run_cap_reached" });
    expect(llm.calls).toEqual([]);

    const edited = await postOps(
      new Request(`http://localhost/api/drafts/${id}/ops`, {
        method: "POST",
        headers: guest.headers,
        body: JSON.stringify({
          baseRevision: 1,
          ops: [{ op: "pin", performance_id: ids[0] }],
        }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(edited.status).toBe(200);
  });

  test("a stale baseRevision gets 409 with the current draft", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      free: true,
    });

    const response = await post(
      id,
      { baseRevision: null, mode: "generate", input },
      guest.headers,
    );
    expect(response.status).toBe(409);
    const body = errorBody.parse(await response.json());
    expect(body.error === "conflict" && body.current.revision?.number).toBe(1);
    expect(llm.calls).toEqual([]);
  });

  test("checks run in order: owner, baseRevision, rate limit, entitlement", async () => {
    const guest = await asGuest();
    const free = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      free: true,
    });
    const id = await draftAt(ids, { owner_guest_id: guest.guestId });
    const regenerate = { baseRevision: 1, mode: "regenerate" };

    const stranger = await asGuest();
    expect(
      (await post(id, { ...regenerate, baseRevision: 2 }, stranger.headers))
        .status,
    ).toBe(404);

    // Ten runs in the last hour: the guest's limit (architecture 9.2).
    await pastRuns(free, 10, "10 minutes");
    expect(
      (await post(id, { ...regenerate, baseRevision: 2 }, guest.headers))
        .status,
    ).toBe(409);
    const limited = await post(id, regenerate, guest.headers);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: "rate_limited" });

    await sql`update curator_run set created_at = now() - interval '2 hours'
      where draft_id = ${free}`;
    expect((await post(id, regenerate, guest.headers)).status).toBe(402);
    expect(llm.calls).toEqual([]);
  });

  test("a read_only draft gets read_only", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      status: "read_only",
    });
    const response = await post(
      id,
      { baseRevision: 1, mode: "regenerate" },
      guest.headers,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "read_only" });
  });

  test("started arrives before the fake adapter is called", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
    });
    let started = false;
    const seen: boolean[] = [];
    llm.before = () => {
      seen.push(started);
    };

    const response = await post(
      draft.id,
      { baseRevision: null, mode: "generate", input },
      guest.headers,
    );
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();
    const first = await reader.read();
    started = streamEvent.parse(JSON.parse(first.value!)).type === "started";
    expect(started).toBe(true);
    while (!(await reader.read()).done);

    expect(seen).toEqual([true, true]);
    expect(llm.calls).toEqual(["extractBrief", "compose"]);
  });

  test("a client that disconnects after started still gets its revision and run written", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
    });

    const response = await post(
      draft.id,
      { baseRevision: null, mode: "generate", input },
      guest.headers,
    );
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();
    const first = streamEvent.parse(JSON.parse((await reader.read()).value!));
    await reader.cancel();
    expect(first.type).toBe("started");

    await settle();
    const runId = (first as { runId: string }).runId;
    expect(await runs(draft.id)).toEqual([
      { id: runId, kind: "generate", error: null },
    ]);
    const [revision] = await sql`
      select number, curator_run_id from playlist_revision
      where draft_id = ${draft.id}`;
    expect(revision).toEqual({ number: 1, curator_run_id: runId });
    expect(await draftRow(draft.id)).toMatchObject({ current_revision: 1 });
  });

  test("past the ceiling the run ends generation_failed and the draft keeps its revision", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      free: true,
    });
    await sql`update playlist_revision set brief = ${sql.json(heldBrief)}
      where draft_id = ${id}`;
    llm.before = () => new Promise((resolve) => setTimeout(resolve, 300));

    const run = await playlist.startRun(
      {
        owner: { kind: "guest", guestId: guest.guestId },
        ipHash: Buffer.from(randomUUID()),
        now: new Date(),
        ceilingMs: 50,
        waitUntil: (p) => background.push(p),
      },
      id,
      { kind: "generate", body: { baseRevision: 1, mode: "regenerate" } },
    );
    if (!run.ok) throw new Error(run.error.error);
    const events: StreamEvent[] = [];
    for await (const event of run.value) events.push(event);
    // Regenerate skips the brief step, so the model is held at compose.
    expect(events.map((e) => e.type)).toEqual([
      "started",
      "brief",
      "candidates",
      "error",
    ]);
    expect(events.at(-1)).toEqual({ type: "error", code: "generation_failed" });

    await settle();
    expect(await runs(id)).toEqual([
      expect.objectContaining({ kind: "regenerate", error: "timeout" }),
    ]);
    expect(await draftRow(id)).toMatchObject({ current_revision: 1 });
  });

  test("a model failure ends generation_failed, records the run and leaves the draft", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
    });
    llm.error = "provider";

    const response = await post(
      draft.id,
      { baseRevision: null, mode: "generate", input },
      guest.headers,
    );
    const events = await read(response);
    expect(events.map((e) => e.type)).toEqual(["started", "error"]);
    await settle();
    expect(await runs(draft.id)).toEqual([
      expect.objectContaining({ kind: "generate", error: "provider" }),
    ]);
    expect(await draftRow(draft.id)).toMatchObject({
      current_revision: null,
      free: true,
    });
  });

  test("fill on a hand-built draft runs to the draft's length and keeps the picks", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
      creation_method: "manual",
      duration_target_s: 1800,
      current_revision: 1,
    });
    const picks = ids.slice(0, 2).map((id) => ({
      performance_id: id,
      pinned: "include",
      source: "manual",
    }));
    await factories.playlistRevision({
      draft_id: draft.id,
      number: 1,
      trigger: "edit",
      items: sql.json(picks),
    });

    const response = await post(
      draft.id,
      { baseRevision: 1, mode: "fill" },
      guest.headers,
    );
    const result = (await read(response)).at(-1)!;
    expect(result.type).toBe("result");
    const view = draftView.parse(
      (result as Extract<StreamEvent, { type: "result" }>).draft,
    );
    expect(view.revision).toMatchObject({ number: 2, trigger: "generate" });
    expect(view.revision!.brief!.duration_s).toBe(1800);
    for (const pick of picks) expect(view.revision!.items).toContainEqual(pick);
    await settle();
    expect(await runs(draft.id)).toEqual([
      expect.objectContaining({ kind: "fill", error: null }),
    ]);
  });

  test("regenerate keeps a position pin where it is and the draft's title", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids.slice(0, 3), {
      owner_guest_id: guest.guestId,
      free: true,
      title: "Named by hand",
    });
    const items = [
      aiItem(ids[0]),
      { ...aiItem(ids[1]), pinned: "position" },
      aiItem(ids[2]),
    ];
    await sql`update playlist_revision set items = ${sql.json(items)},
      brief = ${sql.json(heldBrief)} where draft_id = ${id}`;

    const response = await post(
      id,
      { baseRevision: 1, mode: "regenerate" },
      guest.headers,
    );
    const result = (await read(response)).at(-1) as Extract<
      StreamEvent,
      { type: "result" }
    >;
    expect(result.draft.revision).toMatchObject({
      number: 2,
      trigger: "regenerate",
    });
    expect(result.draft.revision!.items[1]).toEqual(items[1]);
    expect(result.draft.draft.title).toBe("Named by hand");
  });
});
