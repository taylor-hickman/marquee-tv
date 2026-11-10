import { sql } from "@/test/db";
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { errorBody, type StreamEvent, streamEvent } from "@/contracts";
import { asGuest } from "@/lib/auth/testing";
import { catalogIds, draftAt } from "@/modules/playlist/testing";
import { heldBrief, llm, resetLlm, settle } from "../generate/testing";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/curator/llm", async (importOriginal) =>
  (await import("../generate/testing")).mockLlm(await importOriginal()),
);
vi.mock("next/server", async (importOriginal) => {
  const { background } = await import("../generate/testing");
  return {
    ...(await importOriginal<object>()),
    after: (run: Promise<unknown>) => background.push(run),
  };
});

const post = (id: string, body: unknown, headers: Record<string, string>) =>
  POST(
    new Request(`http://localhost/api/drafts/${id}/refine`, {
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

let ids: number[];

beforeAll(async () => {
  ids = await catalogIds(3);
});

afterEach(async () => {
  await settle();
  resetLlm();
});

// A generated draft at revision 1, holding the brief.
async function generated(draft: Record<string, unknown>) {
  const id = await draftAt(ids, draft);
  await sql`update playlist_revision set brief = ${sql.json(heldBrief)}
    where draft_id = ${id}`;
  return id;
}

describe("POST /api/drafts/:id/refine", () => {
  test("writes a refine revision with the instruction, keeps the title and takes the new arc", async () => {
    const guest = await asGuest();
    const id = await generated({
      owner_guest_id: guest.guestId,
      free: true,
      title: "Named by hand",
      description: "Old arc",
    });

    const response = await post(
      id,
      { baseRevision: 1, instruction: "more upbeat" },
      guest.headers,
    );
    expect(response.status).toBe(200);
    const events = await read(response);
    expect(events.map((e) => e.type)).toEqual([
      "started",
      "brief",
      "candidates",
      "result",
    ]);
    const { draft } = events.at(-1) as Extract<StreamEvent, { type: "result" }>;
    expect(draft.revision).toMatchObject({
      number: 2,
      trigger: "refine",
      instruction: "more upbeat",
    });
    expect(draft.draft).toMatchObject({
      title: "Named by hand",
      description: "Easy, then up",
    });
    await settle();
    const [run] =
      await sql`select kind, error from curator_run where draft_id = ${id}`;
    expect(run).toEqual({ kind: "refine", error: null });
  });

  test("rule 3: refine on a draft without an entitlement gets 402", async () => {
    const guest = await asGuest();
    await generated({ owner_guest_id: guest.guestId, free: true });
    const id = await generated({ owner_guest_id: guest.guestId });

    const response = await post(
      id,
      { baseRevision: 1, instruction: "more upbeat" },
      guest.headers,
    );
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: "payment_required" });
    expect(llm.calls).toEqual([]);
  });

  test("a stale baseRevision gets 409", async () => {
    const guest = await asGuest();
    const id = await generated({ owner_guest_id: guest.guestId, free: true });
    const response = await post(
      id,
      { baseRevision: 2, instruction: "more upbeat" },
      guest.headers,
    );
    expect(response.status).toBe(409);
    expect(errorBody.parse(await response.json()).error).toBe("conflict");
  });

  test("a set with no brief can't be refined", async () => {
    const guest = await asGuest();
    const id = await draftAt(ids, {
      owner_guest_id: guest.guestId,
      free: true,
    });
    const response = await post(
      id,
      { baseRevision: 1, instruction: "more upbeat" },
      guest.headers,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(llm.calls).toEqual([]);
  });
});
