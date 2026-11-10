import { sessionUser } from "@/lib/auth/supabase";
import { getAccount } from "@/modules/billing";
import { fail } from "@/modules/playlist";

// The signed-in user's email and plan for the account page (J10).
export async function GET(request: Request) {
  const user = await sessionUser(request);
  const account = user && (await getAccount(user.id));
  if (!account) return fail({ error: "unauthorized" });
  return Response.json(account);
}
