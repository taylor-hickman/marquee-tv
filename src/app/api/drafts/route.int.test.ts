import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { createDraftResponse } from "@/contracts";
import { examples } from "@/contracts/examples";
import { GUEST_TOKEN_HEADER } from "@/lib/auth";
import { asGuest, asUser } from "@/lib/auth/testing";
import { GUESTS_PER_IP_PER_HOUR } from "@/lib/rate-limit";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

let n = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/drafts", {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.113.${++n}`, ...headers },
      body: JSON.stringify(body),
    }),
  );

const ownersOf = async (id: string) => {
  const [row] = await sql`
    select owner_guest_id, owner_user_id, creation_method, duration_target_s
    from playlist_draft where id = ${id}`;
  return row;
};

describe("POST /api/drafts", () => {
  test("without a token, creates a guest and returns its token once", async () => {
    const response = await post(examples.createDraftRequest);
    expect(response.status).toBe(201);
    const body = createDraftResponse.parse(await response.json());
    expect(body.guestToken).toBeDefined();
    expect(body.draft.revision).toBeNull();
    expect(body.draft.draft).toMatchObject({
      status: "active",
      free: false,
      creationMethod: "typed",
      durationTargetS: examples.briefInput.durationS,
    });
    expect(body.draft.entitlement).toEqual({ state: "free", runsLeft: 25 });

    // The token it returned owns the new draft.
    const again = await post(
      { creationMethod: "manual" },
      { [GUEST_TOKEN_HEADER]: body.guestToken! },
    );
    const second = createDraftResponse.parse(await again.json());
    expect(second.guestToken).toBeUndefined();
    expect((await ownersOf(second.draft.draft.id)).owner_guest_id).toBe(
      (await ownersOf(body.draft.draft.id)).owner_guest_id,
    );
  });

  test("creates a draft for an existing guest or user without a new token", async () => {
    const guest = await asGuest();
    const forGuest = createDraftResponse.parse(
      await (await post({ creationMethod: "chip" }, guest.headers)).json(),
    );
    expect(forGuest.guestToken).toBeUndefined();
    expect(await ownersOf(forGuest.draft.draft.id)).toMatchObject({
      owner_guest_id: guest.guestId,
      creation_method: "chip",
      duration_target_s: null,
    });

    const user = await asUser();
    const forUser = createDraftResponse.parse(
      await (await post({ creationMethod: "artist" }, user.headers)).json(),
    );
    expect(await ownersOf(forUser.draft.draft.id)).toMatchObject({
      owner_user_id: user.userId,
      owner_guest_id: null,
    });
  });

  test("rejects a bad body", async () => {
    const response = await post({ creationMethod: "telepathy" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  test("limits new guests per IP", async () => {
    const headers = { "x-forwarded-for": "192.0.2.77" };
    for (let i = 0; i < GUESTS_PER_IP_PER_HOUR; i++) {
      expect((await post({ creationMethod: "typed" }, headers)).status).toBe(
        201,
      );
    }
    const response = await post({ creationMethod: "typed" }, headers);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
