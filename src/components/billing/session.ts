import type { CheckoutRequest, DraftId } from "@/contracts";
import { createApiClient } from "@/lib/client/api";

export type Plan = CheckoutRequest["plan"];

// Every call sends the Supabase session when someone is signed in.
export const api = createApiClient();

// Where a 402 sends the person, with the plan the error body names (E4).
export const planPath = (draftId: DraftId, plan: Plan) =>
  `/plan?draft=${draftId}&plan=${plan}`;

// Where the held generation resumes once the entitlement exists: the editor
// starts POST /generate without input, so the server uses the held brief.
export const resumePath = (draftId: DraftId) => `/d/${draftId}?run=generate`;
