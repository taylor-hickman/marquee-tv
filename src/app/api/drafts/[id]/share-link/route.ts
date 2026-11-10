import { shareLinkRequest } from "@/contracts";
import * as playlist from "@/modules/playlist";

// The short code behind getmarquee.tv/s/<code>, one per draft, revision and
// start index.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/drafts/[id]/share-link">,
) {
  const { id } = await params;
  const owner = await playlist.authorize(request, id);
  if (!owner.ok) return playlist.fail(owner.error);
  const body = await playlist.readBody(request, shareLinkRequest);
  if (!body.ok) return playlist.fail(body.error);
  return playlist.respond(
    await playlist.createShareLink(owner.value, id, body.value),
  );
}
