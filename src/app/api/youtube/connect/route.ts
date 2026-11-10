import { youtubeConnectRequest } from "@/contracts";
import { sessionUser } from "@/lib/auth/supabase";
import { getFlag } from "@/lib/flags";
import * as playlist from "@/modules/playlist";
import { connectUrl, NONCE_COOKIE } from "@/modules/youtube";

// Starts Save to my YouTube's Google consent (J12) for a signed-in user's
// draft. The nonce cookie ties the callback to this browser.
export async function POST(request: Request) {
  if ((await getFlag("handoff_mode")) !== "api") {
    return playlist.fail({ error: "not_found" });
  }
  const user = await sessionUser(request);
  if (!user) return playlist.fail({ error: "unauthorized" });
  const body = await playlist.readBody(request, youtubeConnectRequest);
  if (!body.ok) return playlist.fail(body.error);
  const owner = await playlist.authorize(request, body.value.draftId);
  if (!owner.ok) return playlist.fail(owner.error);
  if (owner.value.kind !== "user") return playlist.fail({ error: "not_found" });

  const { url, nonce } = connectUrl(
    user.id,
    body.value.draftId,
    new URL(request.url).origin,
    user.email,
  );
  return Response.json(
    { url },
    {
      headers: {
        "set-cookie": `${NONCE_COOKIE}=${nonce}; Path=/api/youtube/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    },
  );
}
