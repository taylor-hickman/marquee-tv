import { sessionUser } from "@/lib/auth/supabase";
import { deleteAccount, getAccount } from "@/modules/billing";
import { fail } from "@/modules/playlist";

// The signed-in user's email and plan for the account page (J10).
export async function GET(request: Request) {
  const user = await sessionUser(request);
  const account = user && (await getAccount(user.id));
  if (!account) return fail({ error: "unauthorized" });
  return Response.json(account);
}

// Delete my data (J10). Only a signed-in user has an account to delete.
export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return fail({ error: "unauthorized" });
  await deleteAccount(user.id);
  return Response.json({ deleted: true });
}
