import "server-only";
import { sql } from "@/lib/db";
import { stripe } from "./stripe";
import type { DeleteAccount } from "./types";

// Delete my data (architecture 7.3, Account management; journeys J10).
// Subscriptions are cancelled first, so a Stripe failure leaves the account
// whole and the person can try again rather than be billed with no account.
// Deleting the auth.users row cascades to app_user, then to entitlements,
// drafts, revisions and share links; curator_run, handoff_event and event
// rows stay with their draft and user links set null (the schema's foreign
// keys). A webhook arriving afterwards finds no app_user and writes nothing.

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
  await sql`delete from auth.users where id = ${userId}`;
};
