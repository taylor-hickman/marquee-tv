import "@/test/db";
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
import { urlResponse } from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import * as factories from "@/test/factories";
import { POST as checkout } from "./checkout/route";
import { POST as portal } from "./portal/route";

vi.mock("server-only", () => ({}));

// Stripe on localhost, where STRIPE_API_BASE points the client. Each request's
// form body is kept so a test can read what was sent.
const sent: URLSearchParams[] = [];
const replies: Record<string, object> = {
  "/v1/checkout/sessions": {
    id: "cs_test_marquee",
    object: "checkout.session",
    url: "https://checkout.stripe.com/c/pay/cs_test_marquee",
  },
  "/v1/billing_portal/sessions": {
    id: "bps_test_marquee",
    object: "billing_portal.session",
    url: "https://billing.stripe.com/p/session/test_marquee",
  },
};
const stripe = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  sent.push(new URLSearchParams(body));
  const reply = replies[request.url!];
  response.writeHead(reply ? 200 : 404, { "content-type": "application/json" });
  response.end(
    JSON.stringify(reply ?? { error: { type: "invalid_request_error" } }),
  );
});

beforeAll(async () => {
  await new Promise<void>((resolve) => stripe.listen(0, "127.0.0.1", resolve));
  const { port } = stripe.address() as AddressInfo;
  vi.stubEnv("STRIPE_API_BASE", `http://127.0.0.1:${port}`);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_marquee");
  vi.stubEnv("STRIPE_PRICE_PASS", "price_test_pass");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_test_monthly");
});
afterEach(() => {
  sent.length = 0;
});
afterAll(() => stripe.close());

const origin = "https://marquee.test";
const post = (
  route: typeof checkout,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
) =>
  route(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

async function userWithHeldDraft() {
  const user = await asUser();
  const held = await factories.playlistDraft({
    owner_user_id: user.userId,
    status: "awaiting_payment",
  });
  return { ...user, draftId: held.id as string };
}

describe("POST /api/billing/checkout", () => {
  test("a pass is a one-off payment bound to the held draft", async () => {
    const user = await userWithHeldDraft();
    const response = await post(
      checkout,
      "/api/billing/checkout",
      user.headers,
      {
        plan: "session_pass",
        draftId: user.draftId,
      },
    );
    expect(response.status).toBe(200);
    expect(urlResponse.parse(await response.json()).url).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_marquee",
    );

    const [params] = sent;
    expect(Object.fromEntries(params)).toMatchObject({
      mode: "payment",
      "line_items[0][price]": "price_test_pass",
      "line_items[0][quantity]": "1",
      client_reference_id: user.userId,
      "metadata[userId]": user.userId,
      "metadata[draftId]": user.draftId,
      "metadata[plan]": "session_pass",
      "payment_intent_data[metadata][draftId]": user.draftId,
      customer_creation: "always",
      success_url: `${origin}/plan?draft=${user.draftId}&checkout=complete`,
      cancel_url: `${origin}/plan?draft=${user.draftId}`,
    });
    expect(params.get("customer_email")).toMatch(/@example\.test$/);
  });

  test("the monthly plan is a subscription carrying the same metadata", async () => {
    const user = await userWithHeldDraft();
    const response = await post(
      checkout,
      "/api/billing/checkout",
      user.headers,
      {
        plan: "subscription",
        draftId: user.draftId,
      },
    );
    expect(response.status).toBe(200);
    expect(Object.fromEntries(sent[0])).toMatchObject({
      mode: "subscription",
      "line_items[0][price]": "price_test_monthly",
      "subscription_data[metadata][userId]": user.userId,
      "subscription_data[metadata][draftId]": user.draftId,
    });
    expect(sent[0].has("customer_creation")).toBe(false);
  });

  test("a returning payer checks out as the same Stripe customer", async () => {
    const user = await userWithHeldDraft();
    await factories.entitlement({
      user_id: user.userId,
      kind: "session_pass",
      stripe_customer_id: "cus_test_returning",
    });
    await post(checkout, "/api/billing/checkout", user.headers, {
      plan: "subscription",
      draftId: user.draftId,
    });
    expect(sent[0].get("customer")).toBe("cus_test_returning");
    expect(sent[0].has("customer_email")).toBe(false);
  });

  test("someone else's draft is not found", async () => {
    const owner = await userWithHeldDraft();
    const other = await asUser();
    const response = await post(
      checkout,
      "/api/billing/checkout",
      other.headers,
      {
        plan: "session_pass",
        draftId: owner.draftId,
      },
    );
    expect(response.status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  test("a guest must sign in first", async () => {
    const guest = await asGuest();
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.guestId,
    });
    const response = await post(
      checkout,
      "/api/billing/checkout",
      guest.headers,
      {
        plan: "session_pass",
        draftId: draft.id,
      },
    );
    expect(response.status).toBe(401);
  });

  test("a bad body is invalid_request", async () => {
    const user = await asUser();
    const response = await post(
      checkout,
      "/api/billing/checkout",
      user.headers,
      {
        plan: "annual",
      },
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/billing/portal", () => {
  test("returns the Customer Portal for the user's Stripe customer", async () => {
    const user = await asUser();
    await factories.entitlement({
      user_id: user.userId,
      stripe_customer_id: "cus_test_portal",
    });
    const response = await post(portal, "/api/billing/portal", user.headers);
    expect(response.status).toBe(200);
    expect(urlResponse.parse(await response.json()).url).toBe(
      "https://billing.stripe.com/p/session/test_marquee",
    );
    expect(Object.fromEntries(sent[0])).toEqual({
      customer: "cus_test_portal",
      return_url: `${origin}/account`,
    });
  });

  test("a user who never paid has nothing to manage", async () => {
    const user = await asUser();
    const response = await post(portal, "/api/billing/portal", user.headers);
    expect(response.status).toBe(404);
  });

  test("a guest must sign in first", async () => {
    const guest = await asGuest();
    const response = await post(portal, "/api/billing/portal", guest.headers);
    expect(response.status).toBe(401);
  });
});
