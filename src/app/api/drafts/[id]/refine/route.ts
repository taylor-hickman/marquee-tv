import { refineRequest } from "@/contracts";
import { ipHash } from "@/lib/rate-limit";
import * as playlist from "@/modules/playlist";

// Streamed refine (architecture 6.3), checked and run as generate is:
// owner, baseRevision, rate limit, entitlement (CLAUDE.md rule 3), then the
// 25-run cap; the run streams one event per line and finishes even if the
// client leaves.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/drafts/[id]/refine">,
) {
  const { id } = await params;
  const owner = await playlist.authorize(request, id);
  if (!owner.ok) return playlist.fail(owner.error);
  const body = await playlist.readBody(request, refineRequest);
  if (!body.ok) return playlist.fail(body.error);
  const run = await playlist.startRun(
    {
      owner: owner.value,
      ipHash: ipHash(request),
      now: new Date(),
      ceilingMs: playlist.RUN_CEILING_MS,
    },
    id,
    { kind: "refine", body: body.value },
  );
  return run.ok ? playlist.streamResponse(run.value) : playlist.fail(run.error);
}
