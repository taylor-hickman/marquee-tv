import { auth } from "@/app/auth/supabase";
import type { CheckoutRequest, DraftId } from "@/contracts";
import { createApiClient } from "@/lib/client/api";

export type Plan = CheckoutRequest["plan"];

// The browser's Supabase session (implicit flow, kept in local storage by the
// client in src/app/auth) and an API client that sends it.

export async function accessToken(): Promise<string | null> {
  const { data } = await auth()
    .getSession()
    .catch(() => ({ data: { session: null } }));
  return data.session?.access_token ?? null;
}

export const api = createApiClient({ getAccessToken: accessToken });

// Where a 402 sends the person, with the plan the error body names (E4).
export const planPath = (draftId: DraftId, plan: Plan) =>
  `/plan?draft=${draftId}&plan=${plan}`;

// Where the held generation resumes once the entitlement exists: the editor
// starts POST /generate without input, so the server uses the held brief.
export const resumePath = (draftId: DraftId) => `/d/${draftId}?run=generate`;
