import { replaceOptionsRequest } from "@/contracts";
import * as playlist from "@/modules/playlist";

// Three alternatives for one slot, from the catalog with no model call. Never
// entitlement-checked (CLAUDE.md rule 3).
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/drafts/[id]/replace-options">,
) {
  const { id } = await params;
  const owner = await playlist.authorize(request, id);
  if (!owner.ok) return playlist.fail(owner.error);
  const query = replaceOptionsRequest.safeParse({
    id,
    index: new URL(request.url).searchParams.get("index") ?? undefined,
  });
  if (!query.success) {
    return playlist.fail({
      error: "invalid_request",
      issues: query.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    });
  }
  return playlist.respond(
    await playlist.replaceOptions(owner.value, id, query.data.index),
  );
}
