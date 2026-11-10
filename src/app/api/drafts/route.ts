import { createDraftRequest, type Owner } from "@/contracts";
import { getOwner, issueGuest } from "@/lib/auth";
import { ipHash, limitGuests } from "@/lib/rate-limit";
import * as playlist from "@/modules/playlist";

// Creating a draft is always allowed (CLAUDE.md rule 3). A request without a
// valid guest token or session becomes a new guest, and gets its token back once.
export async function POST(request: Request) {
  const body = await playlist.readBody(request, createDraftRequest);
  if (!body.ok) return playlist.fail(body.error);

  let owner: Owner | null = await getOwner(request);
  let guestToken: string | undefined;
  if (!owner) {
    const ip = ipHash(request);
    const limited = await limitGuests(ip, new Date());
    if (limited) return playlist.fail(limited);
    const guest = await issueGuest(ip);
    owner = { kind: "guest", guestId: guest.guestId };
    guestToken = guest.token;
  }

  const draft = await playlist.createDraft(owner, body.value);
  return Response.json({ draft, guestToken }, { status: 201 });
}
