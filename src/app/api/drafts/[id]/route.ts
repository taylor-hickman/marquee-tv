import * as playlist from "@/modules/playlist";

// The current revision, flags and entitlement state.
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/drafts/[id]">,
) {
  const { id } = await params;
  const owner = await playlist.authorize(request, id);
  if (!owner.ok) return playlist.fail(owner.error);
  return playlist.respond(await playlist.getDraft(owner.value, id));
}
