import { youtubeExportRequest } from "@/contracts";
import * as playlist from "@/modules/playlist";
import { exportRevision } from "@/modules/youtube";

// Save to my YouTube (J12): writes the revision to a new playlist in the
// signed-in user's YouTube account, once per revision.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/drafts/[id]/youtube-export">,
) {
  const { id } = await params;
  const owner = await playlist.authorize(request, id);
  if (!owner.ok) return playlist.fail(owner.error);
  // Only a signed-in user has a YouTube account to save to.
  if (owner.value.kind !== "user") {
    return playlist.fail({ error: "unauthorized" });
  }
  const body = await playlist.readBody(request, youtubeExportRequest);
  if (!body.ok) return playlist.fail(body.error);
  return playlist.respond(
    await exportRevision(owner.value.userId, id, body.value.baseRevision),
  );
}
