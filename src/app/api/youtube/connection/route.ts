import { sessionUser } from "@/lib/auth/supabase";
import { fail } from "@/modules/playlist";
import { disconnect, isConnected } from "@/modules/youtube";

// Whether the signed-in user has granted YouTube access, for Account (J10).
export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return fail({ error: "unauthorized" });
  return Response.json({ connected: await isConnected(user.id) });
}

// Disconnect (J10, J12): revokes the grant at Google and forgets it.
export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return fail({ error: "unauthorized" });
  await disconnect(user.id);
  return Response.json({ connected: false });
}
