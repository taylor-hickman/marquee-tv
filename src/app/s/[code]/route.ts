import { shareCode } from "@/contracts";
import { handoffParts } from "@/lib/handoff-url";
import { ipHash, limitPlain } from "@/lib/rate-limit";
import * as events from "@/modules/events";
import * as playlist from "@/modules/playlist";

// getmarquee.tv/s/<code>. R1 found the 302 lands in the YouTube app on iOS and
// Android (docs/architecture/handoff-tests.md), so this redirects, to the first
// part when the list is over 50.
export async function GET(
  request: Request,
  { params }: RouteContext<"/s/[code]">,
) {
  const limited = limitPlain("share", ipHash(request), new Date());
  if (limited) return playlist.fail(limited);

  const { code } = await params;
  const link = shareCode.safeParse(code).success
    ? await playlist.resolveShareLink(code)
    : null;
  const [part] = link ? handoffParts(link.videoIds) : [];
  if (!link || !part) return playlist.fail({ error: "not_found" });

  await events.write("share_link_opened", {
    owner: null,
    draftId: link.draftId,
    props: { revision: link.revision, startIndex: link.startIndex },
  });
  return Response.redirect(part.url, 302);
}
