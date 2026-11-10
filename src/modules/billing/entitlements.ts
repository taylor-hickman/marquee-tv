import "server-only";
import type { TransactionSql } from "postgres";
import type { DraftId, UserId } from "@/contracts";
import { sql } from "@/lib/db";
import type { CanRunCurator, ExpirePasses } from "./types";

// Entitlements (architecture 5.4, 7.3). The Stripe webhook is the only writer
// (webhook.ts calls grantPass and saveSubscription); everything else reads.

// Stripe subscription statuses that let a subscriber run the curator.
const SUBSCRIBED = ["active", "trialing"];

// A session pass is one AI set plus seven days of edits (PRD 16.1).
const PASS_DAYS = 7;

const subscribed = (db: typeof sql | TransactionSql, userId: UserId | null) =>
  db`exists (select 1 from entitlement s where s.user_id = ${userId}
    and s.kind = 'subscription' and s.status = any(${SUBSCRIBED}))`;

// Architecture 7.3's table. A guest's or user's first model-backed draft is
// their free one, so an owner with no free draft yet gets `free` and the run
// marks the draft. A pass draft past its period_end is flipped to read_only
// here as well as by expirePasses, so no run slips in before the job does.
export const canRunCurator: CanRunCurator = async (owner, draft, now) => {
  if (draft.status === "read_only") return "read_only";
  if (draft.free) return "free";

  const guestId = owner.kind === "guest" ? owner.guestId : null;
  const userId = owner.kind === "user" ? owner.userId : null;
  const [row] = await sql<
    { freeUsed: boolean; subscribed: boolean; passEnd: Date | null }[]
  >`
    select
      exists (select 1 from playlist_draft o where o.free
        and (o.owner_guest_id = ${guestId} or o.owner_user_id = ${userId}))
        as "freeUsed",
      ${subscribed(sql, userId)} as subscribed,
      (select period_end from entitlement p where p.id = ${draft.entitlementId}
        and p.user_id = ${userId} and p.kind = 'session_pass') as "passEnd"`;

  if (row.passEnd && row.passEnd > now) return "pass";
  if (row.subscribed) return "subscription";
  if (row.passEnd) {
    await expirePasses(now, draft.id);
    return "read_only";
  }
  return row.freeUsed ? "payment_required" : "free";
};

// Pass drafts whose period_end has come become read_only: playable and
// copyable, no more edits or runs (PRD 16.1, 18.1). A subscriber's drafts stay
// open. Scoped to one draft when `draftId` is given; returns the drafts flipped.
export const expirePasses: ExpirePasses = async (now, draftId) => {
  const rows = await sql<{ id: DraftId }[]>`
    update playlist_draft d set status = 'read_only', updated_at = now()
    from entitlement p
    where p.id = d.entitlement_id and p.kind = 'session_pass'
      and p.period_end <= ${now} and d.status <> 'read_only'
      ${draftId ? sql`and d.id = ${draftId}` : sql``}
      and not exists (select 1 from entitlement s
        where s.user_id = d.owner_user_id and s.kind = 'subscription'
          and s.status = any(${SUBSCRIBED}))
    returning d.id`;
  return rows.map((r) => r.id);
};

// A paid pass: one entitlement per payment intent, so a redelivered event
// changes nothing. The held draft becomes active and the pass binds to it
// (architecture 7.3 step 5). Ignored when the user no longer exists.
export async function grantPass(p: {
  userId: UserId;
  draftId: DraftId;
  customerId: string | null;
  paymentIntentId: string;
  paidAt: Date;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const [pass] = await tx<{ id: string }[]>`
      insert into entitlement (user_id, kind, status, period_end, draft_id,
        stripe_customer_id, stripe_payment_intent_id)
      select id, 'session_pass', 'active',
        ${p.paidAt}::timestamptz + make_interval(days => ${PASS_DAYS}),
        ${p.draftId}, ${p.customerId}, ${p.paymentIntentId}
      from app_user where id = ${p.userId}
      on conflict (stripe_payment_intent_id) do nothing
      returning id`;
    if (!pass) return;
    await tx`
      update playlist_draft
      set status = 'active', entitlement_id = ${pass.id}, updated_at = now()
      where id = ${p.draftId} and owner_user_id = ${p.userId}`;
  });
}

// A subscription as Stripe last described it, keyed by its Stripe id. Stripe
// doesn't order events, so `canceled`, which Stripe never leaves, stays put
// and period_end only moves forward. Then the user's drafts follow (7.3): any
// subscription active opens every draft, held ones included; none active
// makes the drafts the curator ran on under it read_only.
export async function saveSubscription(s: {
  userId: UserId;
  draftId: DraftId | null;
  customerId: string | null;
  subscriptionId: string;
  status: string;
  periodEnd: Date | null;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const [saved] = await tx`
      insert into entitlement (user_id, kind, status, period_end, draft_id,
        stripe_customer_id, stripe_subscription_id)
      select id, 'subscription', ${s.status}, ${s.periodEnd}, ${s.draftId},
        ${s.customerId}, ${s.subscriptionId}
      from app_user where id = ${s.userId}
      on conflict (stripe_subscription_id) do update set
        status = case when entitlement.status = 'canceled'
          then 'canceled' else excluded.status end,
        period_end = greatest(entitlement.period_end, excluded.period_end),
        stripe_customer_id = coalesce(excluded.stripe_customer_id,
          entitlement.stripe_customer_id)
      returning id`;
    if (!saved) return;

    const [{ active }] = await tx<{ active: boolean }[]>`
      select ${subscribed(tx, s.userId)} as active`;
    if (active) {
      await tx`
        update playlist_draft set status = 'active', updated_at = now()
        where owner_user_id = ${s.userId}
          and status in ('read_only', 'awaiting_payment')`;
      return;
    }
    await tx`
      update playlist_draft d set status = 'read_only', updated_at = now()
      where owner_user_id = ${s.userId} and status = 'active' and not free
        and exists (select 1 from curator_run r where r.draft_id = d.id)
        and not exists (select 1 from entitlement p
          where p.id = d.entitlement_id and p.period_end > now())`;
  });
}
