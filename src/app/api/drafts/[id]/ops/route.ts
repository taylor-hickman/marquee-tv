import { opsRequest } from "@/contracts";
import * as playlist from "@/modules/playlist";

// Manual edits. Never entitlement-checked (CLAUDE.md rule 3); blocked only by
// `read_only`.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/drafts/[id]/ops">,
) {
  const { id } = await params;
  const owner = await playlist.authorize(request, id);
  if (!owner.ok) return playlist.fail(owner.error);
  const body = await playlist.readBody(request, opsRequest);
  if (!body.ok) return playlist.fail(body.error);
  return playlist.respond(await playlist.applyOps(owner.value, id, body.value));
}
