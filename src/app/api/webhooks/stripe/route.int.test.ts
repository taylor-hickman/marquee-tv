import { sql } from "@/test/db";
import { beforeAll, describe, expect, test, vi } from "vitest";
import Stripe from "stripe";
import { canRunCurator, expirePasses } from "@/modules/billing";
import {
  checkoutCompleted,
  invoicePaid,
  subscriptionChanged,
  WEBHOOK_SECRET,
  webhookRequest,
} from "@/modules/billing/testing";
import * as factories from "@/test/factories";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_marquee");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
});

const DAY = 86_400_000;

const send = async (event: Stripe.Event, signature?: string | null) => {
  const response = await POST(webhookRequest(event, signature));
  return { status: response.status, body: await response.json() };
};

const entitlements = (userId: string) =>
  sql`select * from entitlement where user_id = ${userId} order by created_at`;
const draftRow = async (id: string) =>
  (await sql`select * from playlist_draft where id = ${id}`)[0];

// A signed-in user with a held draft: their second, awaiting payment.
async function heldDraft() {
  const user = await factories.appUser();
  await factories.playlistDraft({ owner_user_id: user.id, free: true });
  const held = await factories.playlistDraft({
    owner_user_id: user.id,
    status: "awaiting_payment",
  });
  return { userId: user.id as string, draftId: held.id as string };
}

describe("signature", () => {
  test("an unsigned webhook is rejected and writes nothing", async () => {
    const { userId, draftId } = await heldDraft();
    const event = checkoutCompleted({ userId, draftId, plan: "session_pass" });
    expect(await send(event, null)).toEqual({
      status: 400,
      body: { error: "invalid_request", issues: ["stripe-signature: invalid"] },
    });
    expect(await entitlements(userId)).toHaveLength(0);
    expect((await draftRow(draftId)).status).toBe("awaiting_payment");
  });

  test("a webhook signed with another secret is rejected", async () => {
    const { userId, draftId } = await heldDraft();
    const event = checkoutCompleted({ userId, draftId, plan: "subscription" });
    const forged = Stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(event),
      secret: "whsec_someone_else",
    });
    expect((await send(event, forged)).status).toBe(400);
    expect(await entitlements(userId)).toHaveLength(0);
  });

  test("a body changed after signing is rejected", async () => {
    const { userId, draftId } = await heldDraft();
    const event = checkoutCompleted({ userId, draftId, plan: "session_pass" });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(event),
      secret: WEBHOOK_SECRET,
    });
    const other = await heldDraft();
    (event.data.object as Stripe.Checkout.Session).metadata!.userId =
      other.userId;
    expect((await send(event, signature)).status).toBe(400);
    expect(await entitlements(other.userId)).toHaveLength(0);
  });
});

describe("checkout.session.completed", () => {
  test("a pass becomes an entitlement bound to the held draft, which goes active", async () => {
    const { userId, draftId } = await heldDraft();
    const paidAt = new Date("2026-11-09T18:00:00Z");
    const event = checkoutCompleted({
      userId,
      draftId,
      plan: "session_pass",
      created: paidAt,
    });
    expect(await send(event)).toEqual({
      status: 200,
      body: { received: true },
    });

    const [pass] = await entitlements(userId);
    expect(pass).toMatchObject({
      kind: "session_pass",
      status: "active",
      draft_id: draftId,
      period_end: new Date(paidAt.getTime() + 7 * DAY),
    });
    expect(pass.stripe_payment_intent_id).toMatch(/^pi_/);
    expect(pass.stripe_customer_id).toMatch(/^cus_/);
    expect(await draftRow(draftId)).toMatchObject({
      status: "active",
      entitlement_id: pass.id,
    });
  });

  test("a redelivered event grants nothing twice", async () => {
    const { userId, draftId } = await heldDraft();
    const event = checkoutCompleted({ userId, draftId, plan: "session_pass" });
    await send(event);
    await send(event);
    expect(await entitlements(userId)).toHaveLength(1);
  });

  test("a subscription becomes an active entitlement and opens the held draft", async () => {
    const { userId, draftId } = await heldDraft();
    const event = checkoutCompleted({ userId, draftId, plan: "subscription" });
    expect((await send(event)).status).toBe(200);

    const [subscription] = await entitlements(userId);
    expect(subscription).toMatchObject({
      kind: "subscription",
      status: "active",
      draft_id: draftId,
    });
    expect(subscription.stripe_subscription_id).toMatch(/^sub_/);
    expect((await draftRow(draftId)).status).toBe("active");
  });

  test("an unpaid session grants nothing", async () => {
    const { userId, draftId } = await heldDraft();
    const event = checkoutCompleted({
      userId,
      draftId,
      plan: "session_pass",
      paymentStatus: "unpaid",
    });
    expect((await send(event)).status).toBe(200);
    expect(await entitlements(userId)).toHaveLength(0);
    expect((await draftRow(draftId)).status).toBe("awaiting_payment");
  });

  test("a session this app didn't create is acknowledged and skipped", async () => {
    const event = checkoutCompleted({
      userId: "",
      draftId: "",
      plan: "session_pass",
    });
    expect((await send(event)).status).toBe(200);
  });

  test("a user deleted since checkout gets nothing, and Stripe stops retrying", async () => {
    const { userId, draftId } = await heldDraft();
    await sql`delete from auth.users where id = ${userId}`;
    for (const plan of ["session_pass", "subscription"] as const) {
      const event = checkoutCompleted({ userId, draftId, plan });
      expect((await send(event)).status).toBe(200);
    }
    expect(await entitlements(userId)).toHaveLength(0);
  });
});

describe("a pass draft goes read_only after seven days", () => {
  test("from the payment's time, by expirePasses and by canRunCurator", async () => {
    const { userId, draftId } = await heldDraft();
    const paidAt = new Date("2026-11-01T09:00:00Z");
    await send(
      checkoutCompleted({
        userId,
        draftId,
        plan: "session_pass",
        created: paidAt,
      }),
    );
    const owner = { kind: "user", userId } as const;
    const draft = async () => {
      const row = await draftRow(draftId);
      return {
        id: draftId,
        free: row.free,
        status: row.status,
        entitlementId: row.entitlement_id,
      };
    };

    const sixDays = new Date(paidAt.getTime() + 6 * DAY);
    expect(await canRunCurator(owner, await draft(), sixDays)).toBe("pass");
    expect(await expirePasses(sixDays)).not.toContain(draftId);

    const sevenDays = new Date(paidAt.getTime() + 7 * DAY);
    expect(await expirePasses(sevenDays)).toContain(draftId);
    expect((await draftRow(draftId)).status).toBe("read_only");
    expect(await canRunCurator(owner, await draft(), sevenDays)).toBe(
      "read_only",
    );
  });
});

describe("subscription lifecycle", () => {
  // A subscriber with their held draft, a draft the curator ran on, a
  // hand-built draft and their free draft.
  async function subscriber() {
    const { userId, draftId } = await heldDraft();
    const checkout = checkoutCompleted({
      userId,
      draftId,
      plan: "subscription",
    });
    await send(checkout);
    const subscriptionId = (checkout.data.object as Stripe.Checkout.Session)
      .subscription as string;
    const ran = await factories.playlistDraft({ owner_user_id: userId });
    await factories.curatorRun({ draft_id: ran.id });
    await factories.curatorRun({ draft_id: draftId });
    const handBuilt = await factories.playlistDraft({ owner_user_id: userId });
    const [free] =
      await sql`select id from playlist_draft where owner_user_id = ${userId} and free`;
    return {
      userId,
      draftId,
      subscriptionId,
      ran: ran.id as string,
      handBuilt: handBuilt.id as string,
      free: free.id as string,
    };
  }

  const statuses = async (ids: string[]) =>
    Promise.all(ids.map(async (id) => (await draftRow(id)).status));

  test("invoice.paid records the paid period", async () => {
    const s = await subscriber();
    const periodEnd = new Date("2026-12-09T00:00:00Z");
    const event = invoicePaid({ ...s, periodEnd });
    expect((await send(event)).status).toBe(200);
    const [row] = await entitlements(s.userId);
    expect(row).toMatchObject({ status: "active", period_end: periodEnd });
  });

  test("invoice.paid for a subscription that arrives before checkout's event creates it", async () => {
    const { userId, draftId } = await heldDraft();
    const event = invoicePaid({
      userId,
      draftId,
      subscriptionId: "sub_test_early",
      periodEnd: new Date("2026-12-09T00:00:00Z"),
    });
    await send(event);
    expect(await entitlements(userId)).toMatchObject([
      { kind: "subscription", status: "active" },
    ]);
    expect((await draftRow(draftId)).status).toBe("active");
  });

  test("customer.subscription.updated: past_due closes the curator-run drafts, a payment reopens them", async () => {
    const s = await subscriber();
    const periodEnd = new Date("2026-12-09T00:00:00Z");
    await send(
      subscriptionChanged("customer.subscription.updated", {
        ...s,
        status: "past_due",
        periodEnd,
      }),
    );
    expect((await entitlements(s.userId))[0].status).toBe("past_due");
    expect(await statuses([s.draftId, s.ran, s.handBuilt, s.free])).toEqual([
      "read_only",
      "read_only",
      "active",
      "active",
    ]);

    await send(
      invoicePaid({
        ...s,
        periodEnd: new Date("2027-01-09T00:00:00Z"),
      }),
    );
    expect((await entitlements(s.userId))[0]).toMatchObject({
      status: "active",
      period_end: new Date("2027-01-09T00:00:00Z"),
    });
    expect(await statuses([s.draftId, s.ran])).toEqual(["active", "active"]);
  });

  test("customer.subscription.deleted makes drafts read_only, and a late update can't revive it", async () => {
    const s = await subscriber();
    const periodEnd = new Date("2026-12-09T00:00:00Z");
    await send(
      subscriptionChanged("customer.subscription.deleted", {
        ...s,
        status: "canceled",
        periodEnd,
      }),
    );
    expect((await entitlements(s.userId))[0].status).toBe("canceled");
    expect(await statuses([s.draftId, s.ran, s.handBuilt, s.free])).toEqual([
      "read_only",
      "read_only",
      "active",
      "active",
    ]);

    await send(
      subscriptionChanged("customer.subscription.updated", {
        ...s,
        status: "active",
        periodEnd: new Date("2026-11-09T00:00:00Z"),
      }),
    );
    expect((await entitlements(s.userId))[0]).toMatchObject({
      status: "canceled",
      period_end: periodEnd,
    });
    expect(await statuses([s.ran])).toEqual(["read_only"]);
  });

  test("cancelling keeps a draft with a pass still running open", async () => {
    const s = await subscriber();
    const pass = await factories.entitlement({
      user_id: s.userId,
      kind: "session_pass",
      period_end: new Date(Date.now() + DAY),
    });
    await sql`update playlist_draft set entitlement_id = ${pass.id} where id = ${s.ran}`;
    await send(
      subscriptionChanged("customer.subscription.deleted", {
        ...s,
        status: "canceled",
        periodEnd: new Date(),
      }),
    );
    expect(await statuses([s.ran, s.draftId])).toEqual(["active", "read_only"]);
  });

  test("a new subscription reopens every read_only draft", async () => {
    const s = await subscriber();
    await send(
      subscriptionChanged("customer.subscription.deleted", {
        ...s,
        status: "canceled",
        periodEnd: new Date(),
      }),
    );
    await send(
      checkoutCompleted({
        userId: s.userId,
        draftId: s.ran,
        plan: "subscription",
      }),
    );
    expect(await statuses([s.draftId, s.ran])).toEqual(["active", "active"]);
  });

  test("subscription events this app didn't create are skipped", async () => {
    const event = subscriptionChanged("customer.subscription.updated", {
      userId: "",
      draftId: "",
      subscriptionId: "sub_test_foreign",
      status: "active",
      periodEnd: new Date(),
    });
    expect((await send(event)).status).toBe(200);
    const invoice = invoicePaid({
      userId: "",
      draftId: "",
      subscriptionId: "sub_test_foreign",
      periodEnd: new Date(),
    });
    expect((await send(invoice)).status).toBe(200);
    expect(
      await sql`select 1 from entitlement where stripe_subscription_id = 'sub_test_foreign'`,
    ).toHaveLength(0);
  });
});
