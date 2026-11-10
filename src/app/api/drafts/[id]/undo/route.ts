import { undoRequest } from "@/contracts";
import * as playlist from "@/modules/playlist";

// Writes a copy of the previous revision.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/drafts/[id]/undo">,
) {
  const { id } = await params;
  const owner = await playlist.authorize(request, id);
  if (!owner.ok) return playlist.fail(owner.error);
  const body = await playlist.readBody(request, undoRequest);
  if (!body.ok) return playlist.fail(body.error);
  return playlist.respond(await playlist.undo(owner.value, id, body.value));
}
