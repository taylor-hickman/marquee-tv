import "server-only";
import type { AccountResponse, UserId } from "@/contracts";
import { sql } from "@/lib/db";
import { disconnect } from "@/modules/youtube";
import { stripe } from "./stripe";
import type { DeleteAccount } from "./types";

// What the account page shows (J10): the email, the plan the user is on, and
// the plan their cohort sees first (PRD 16.4). A live subscription outranks a
// pass; otherwise the newest entitlement stands, so a lapsed plan still shows
// when it ended.
export async function getAccount(
  userId: UserId,
): Promise<AccountResponse | null> {
  const [user] = await sql<{ email: string; cohort: string | null }[]>`
    select email, cohort from app_user where id = ${userId}`;
  if (!user) return null;
  const [plan] = await sql<
    {
      kind: "session_pass" | "subscription";
      status: string;
      periodEnd: Date | null;
    }[]
  >`
    select kind, status, period_end as "periodEnd" from entitlement
    where user_id = ${userId}
    order by (kind = 'subscription' and status in ('active', 'trialing')) desc,
      created_at desc
    limit 1`;
  return {
    email: user.email,
    defaultPlan: user.cohort === "sub_first" ? "subscription" : "session_pass",
    plan: plan
      ? { ...plan, periodEnd: plan.periodEnd?.toISOString() ?? null }
      : null,
  };
}

// Delete my data (architecture 7.3, Account management; journeys J10).
// Subscriptions are cancelled first, so a Stripe failure leaves the account
// whole and the person can try again rather than be billed with no account.
// Deleting the auth.users row cascades to app_user, then to entitlements,
// drafts, revisions and share links; curator_run, handoff_event and event
// rows stay with their draft and user links set null (the schema's foreign
// keys). A webhook arriving afterwards finds no app_user and writes nothing.
// A YouTube grant is revoked at Google before its row goes.

// Stripe statuses after which a subscription can never charge again.
const ENDED = ["canceled", "incomplete_expired"];

export const deleteAccount: DeleteAccount = async (userId) => {
  const subscriptions = await sql<{ id: string }[]>`
    select stripe_subscription_id as id from entitlement
    where user_id = ${userId} and kind = 'subscription'
      and stripe_subscription_id is not null
      and status <> all(${ENDED})`;
  for (const { id } of subscriptions) {
    await stripe().subscriptions.cancel(id);
  }
  await disconnect(userId);
  await sql`delete from auth.users where id = ${userId}`;
};
