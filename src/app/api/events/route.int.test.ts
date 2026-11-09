import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { examples } from "@/contracts/examples";
import { PLAIN_PER_IP_PER_MINUTE } from "@/lib/rate-limit";
import { asGuest, asUser } from "@/lib/auth/testing";
import * as factories from "@/test/factories";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

let n = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/events", {
      method: "POST",
      // Each test gets its own address, so the per-IP limit stays out of the way.
      headers: { "x-forwarded-for": `198.51.100.${++n}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const eventsNamed = (name: string) =>
  sql`select * from event where name = ${name} order by id`;

describe("POST /api/events", () => {
  test("writes a journey event for the guest and their draft", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
    });
    const response = await post(
      {
        name: "brief_submitted",
        draftId: draft.id,
        props: { entry: "chip" },
      },
      guest.headers,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(examples.eventsResponse);
    const [row] = (await eventsNamed("brief_submitted")).filter(
      (e) => e.draft_id === draft.id,
    );
    expect(row).toMatchObject({
      guest_id: guest.guestId,
      user_id: null,
      props: { entry: "chip" },
    });
  });

  test("accepts an anonymous event and the contract's example", async () => {
    expect((await post({ name: "landing_viewed" })).status).toBe(200);
    expect((await post(examples.eventsRequest)).status).toBe(200);
  });

  test("records a user's event with their id", async () => {
    const user = await asUser();
    await post({ name: "signin_completed" }, user.headers);
    const rows = await eventsNamed("signin_completed");
    expect(rows.map((r) => r.user_id)).toContain(user.userId);
  });

  test("keeps a handoff event's revision, part and start index", async () => {
    const draft = await factories.playlistDraft();
    await post({
      name: "handoff_opened",
      draftId: draft.id,
      revision: 2,
      part: 1,
      startIndex: 4,
    });
    const [row] = (await eventsNamed("handoff_opened")).filter(
      (e) => e.draft_id === draft.id,
    );
    expect(row.props).toEqual({
      revision: 2,
      part: 1,
      startIndex: 4,
      surface: null,
    });
  });

  test("rejects an unknown event name", async () => {
    const response = await post({ name: "page_scrolled" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(await eventsNamed("page_scrolled")).toHaveLength(0);
  });

  test("rejects a body that isn't JSON", async () => {
    const response = await post("not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      issues: [expect.stringMatching(/^body: /)],
    });
  });

  test("leaves off a draft that doesn't exist", async () => {
    const draftId = crypto.randomUUID();
    expect(
      (await post({ name: "item_pinned", draftId, props: { index: 1 } }))
        .status,
    ).toBe(200);
    const rows =
      await sql`select draft_id from event where props->>'index' = '1' and name = 'item_pinned'`;
    expect(rows.every((r) => r.draft_id === null)).toBe(true);
  });

  test("limits one IP per minute", async () => {
    const headers = { "x-forwarded-for": "192.0.2.99" };
    for (let i = 0; i < PLAIN_PER_IP_PER_MINUTE; i++) {
      await post({ name: "landing_viewed" }, headers);
    }
    const response = await post({ name: "landing_viewed" }, headers);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
  });
});
