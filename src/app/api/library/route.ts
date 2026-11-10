import { getOwner } from "@/lib/auth";
import * as playlist from "@/modules/playlist";

// The signed-in user's drafts (PRD 7.7). A guest has no library: their sets
// live in this browser until they sign in and claim them.
export async function GET(request: Request) {
  const owner = await getOwner(request);
  if (owner?.kind !== "user") return playlist.fail({ error: "unauthorized" });
  return Response.json(await playlist.listLibrary(owner.userId));
}
