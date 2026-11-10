import { sessionUser } from "@/lib/auth/supabase";
import { deleteAccount } from "@/modules/billing";
import { fail } from "@/modules/playlist";

// Delete my data (J10). Only a signed-in user has an account to delete.
export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return fail({ error: "unauthorized" });
  await deleteAccount(user.id);
  return Response.json({ deleted: true });
}
