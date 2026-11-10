import { sql } from "@/test/db";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { deleteAccountResponse } from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import { connectUrl, finishConnect } from "@/modules/youtube";
import * as factories from "@/test/factories";
import { DELETE } from "./route";

vi.mock("server-only", () => ({}));

// Stripe on localhost, where STRIPE_API_BASE points the client. Each request's
// method and path is kept; a subscription id in `failing` gets a 500.
const sent: string[] = [];
const failing = new Set<string>();
const stripe = createServer((request, response) => {
  sent.push(`${request.method} ${request.url}`);
  const id = request.url!.split("/").at(-1)!;
  if (failing.has(id)) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { type: "api_error" } }));
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({ id, object: "subscription", status: "canceled" }),
  );
});

beforeAll(async () => {
  await new Promise<void>((resolve) => stripe.listen(0, "127.0.0.1", resolve));
  const { port } = stripe.address() as AddressInfo;
  vi.stubEnv("STRIPE_API_BASE", `http://127.0.0.1:${port}`);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_marquee");
});
afterEach(() => {
  sent.length = 0;
  failing.clear();
});
afterAll(() => stripe.close());

const del = (headers: Record<string, string>) =>
  DELETE(
    new Request("https://marquee.test/api/account", {
      method: "DELETE",
      headers,
    }),
  );

const rows = (table: string, column: string, value: string) =>
  sql`select * from ${sql(table)} where ${sql(column)} = ${value}`;

// A user with something in every table that holds their data.
async function userWithData() {
  const user = await asUser();
  const subscription = await factories.entitlement({
    user_id: user.userId,
    stripe_customer_id: "cus_marquee",
    stripe_subscription_id: `sub_active_${user.userId}`,
  });
  const lapsed = await factories.entitlement({
    user_id: user.userId,
    status: "canceled",
    stripe_subscription_id: `sub_lapsed_${user.userId}`,
  });
  const draft = await factories.playlistDraft({
    owner_user_id: user.userId,
    entitlement_id: subscription.id,
  });
  const pass = await factories.entitlement({
    user_id: user.userId,
    kind: "session_pass",
    draft_id: draft.id,
    stripe_payment_intent_id: `pi_${user.userId}`,
  });
  const run = await factories.curatorRun({
    draft_id: draft.id,
    output_ids: [1, 2, 3],
  });
  await factories.playlistRevision({
    draft_id: draft.id,
    curator_run_id: run.id,
  });
  const link = await factories.shareLink({ draft_id: draft.id });
  const handoff = await factories.handoffEvent({ draft_id: draft.id });
  const event = await factories.event({
    user_id: user.userId,
    draft_id: draft.id,
  });
  return {
    ...user,
    entitlements: [subscription.id, lapsed.id, pass.id],
    draftId: draft.id as string,
    runId: run.id as string,
    shareCode: link.code as string,
    handoffId: handoff.id as string,
    eventId: event.id as string,
  };
}

describe("DELETE /api/account", () => {
  test("deletes the user's data, cancels the live subscription and keeps curator runs unlinked", async () => {
    const user = await userWithData();
    const other = await userWithData();

    const response = await del(user.headers);

    expect(response.status).toBe(200);
    expect(deleteAccountResponse.parse(await response.json())).toEqual({
      deleted: true,
    });
    expect(sent).toEqual([
      `DELETE /v1/subscriptions/sub_active_${user.userId}`,
    ]);

    expect(await rows("auth.users", "id", user.userId)).toEqual([]);
    expect(await rows("app_user", "id", user.userId)).toEqual([]);
    expect(await rows("entitlement", "user_id", user.userId)).toEqual([]);
    expect(await rows("playlist_draft", "owner_user_id", user.userId)).toEqual(
      [],
    );
    expect(await rows("playlist_revision", "draft_id", user.draftId)).toEqual(
      [],
    );
    expect(await rows("share_link", "code", user.shareCode)).toEqual([]);

    const [run] = await rows("curator_run", "id", user.runId);
    expect(run).toMatchObject({ draft_id: null, output_ids: [1, 2, 3] });
    const [handoff] = await rows("handoff_event", "id", user.handoffId);
    expect(handoff).toMatchObject({ draft_id: null });
    const [event] = await rows("event", "id", user.eventId);
    expect(event).toMatchObject({ user_id: null, draft_id: null });

    expect(await rows("app_user", "id", other.userId)).toHaveLength(1);
    expect(await rows("entitlement", "user_id", other.userId)).toHaveLength(3);
    expect(await rows("playlist_draft", "id", other.draftId)).toHaveLength(1);
    expect(await rows("share_link", "code", other.shareCode)).toHaveLength(1);
    expect(await rows("curator_run", "id", other.runId)).toMatchObject([
      { draft_id: other.draftId },
    ]);
  });

  test("a YouTube grant is revoked at Google before the account goes", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("YOUTUBE_TOKEN_KEY", randomBytes(32).toString("base64"));
    const revoked: string[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url === "https://oauth2.googleapis.com/token") {
        return Response.json({
          refresh_token: "1//grant",
          scope: "https://www.googleapis.com/auth/youtube",
        });
      }
      if (request.url === "https://oauth2.googleapis.com/revoke") {
        revoked.push(new URLSearchParams(await request.text()).get("token")!);
        return new Response(null, { status: 200 });
      }
      return realFetch(request);
    });
    try {
      const user = await asUser();
      const draft = await factories.playlistDraft({
        owner_user_id: user.userId,
      });
      const origin = "https://marquee.test";
      const { url, nonce } = connectUrl(
        user.userId,
        draft.id,
        origin,
        `${user.userId}@example.test`,
      );
      const state = new URL(url).searchParams.get("state")!;
      await finishConnect({ code: "code", state }, nonce, origin);
      expect(
        await rows("youtube_connection", "user_id", user.userId),
      ).toHaveLength(1);

      expect((await del(user.headers)).status).toBe(200);
      expect(revoked).toEqual(["1//grant"]);
      expect(await rows("youtube_connection", "user_id", user.userId)).toEqual(
        [],
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("a user with no subscription is deleted without calling Stripe", async () => {
    const user = await asUser();
    await factories.playlistDraft({ owner_user_id: user.userId });

    expect((await del(user.headers)).status).toBe(200);
    expect(sent).toEqual([]);
    expect(await rows("app_user", "id", user.userId)).toEqual([]);
  });

  test("when Stripe fails nothing is deleted", async () => {
    const user = await userWithData();
    failing.add(`sub_active_${user.userId}`);

    await expect(del(user.headers)).rejects.toThrow();

    expect(await rows("app_user", "id", user.userId)).toHaveLength(1);
    expect(await rows("playlist_draft", "id", user.draftId)).toHaveLength(1);
  });

  test("a guest or a request without a session gets 401", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
    });

    expect((await del(guest.headers)).status).toBe(401);
    expect((await del({})).status).toBe(401);
    expect(await rows("playlist_draft", "id", draft.id)).toHaveLength(1);
  });
});
