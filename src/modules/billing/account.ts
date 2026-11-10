import "server-only";
import type { AccountResponse, UserId } from "@/contracts";
import { sql } from "@/lib/db";

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
