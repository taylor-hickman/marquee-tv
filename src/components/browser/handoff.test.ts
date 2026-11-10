import { describe, expect, test } from "vitest";
import { examples } from "@/contracts/examples";
import { createApiClient } from "@/lib/client/api";
import { draftFromPicks, editorPath } from "./handoff";

const DRAFT = examples.createDraftResponse.draft.draft.id;

function fakeServer(opsStatus = 200) {
  const sent: { path: string; body: unknown }[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    sent.push({ path, body: init?.body && JSON.parse(String(init.body)) });
    if (path === "/api/drafts") {
      return Response.json(examples.createDraftResponse);
    }
    return opsStatus === 200
      ? Response.json(examples.draftView)
      : Response.json({ error: "read_only" }, { status: opsStatus });
  };
  return { sent, api: createApiClient({ fetch }) };
}

describe("draftFromPicks", () => {
  test("creates a manual draft and adds the picks in the order added", async () => {
    const { sent, api } = fakeServer();
    expect(await draftFromPicks(api, [12, 7, 30])).toBe(DRAFT);
    expect(sent).toEqual([
      { path: "/api/drafts", body: { creationMethod: "manual" } },
      {
        path: `/api/drafts/${DRAFT}/ops`,
        body: {
          baseRevision: null,
          ops: [
            { op: "add", performance_id: 12 },
            { op: "add", performance_id: 7 },
            { op: "add", performance_id: 30 },
          ],
        },
      },
    ]);
  });

  test("no draft id when the adds are refused", async () => {
    const { api } = fakeServer(403);
    expect(await draftFromPicks(api, [12])).toBeNull();
  });
});

describe("editorPath", () => {
  test("asks the editor to start fill only for a fill handoff", () => {
    expect(editorPath(DRAFT, "fill")).toBe(`/d/${DRAFT}?run=fill`);
    expect(editorPath(DRAFT, null)).toBe(`/d/${DRAFT}`);
  });
});
