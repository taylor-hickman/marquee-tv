import { fail } from "@/modules/playlist";
import { finishConnect, NONCE_COOKIE } from "@/modules/youtube";

// Google's redirect back from consent. Stores the grant and returns the
// browser to the draft, which starts the export on `?youtube=save`.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return fail({ error: "invalid_request", issues: ["state"] });
  const nonce =
    request.headers
      .get("cookie")
      ?.match(new RegExp(`(?:^|; )${NONCE_COOKIE}=([^;]+)`))?.[1] ?? null;
  const location = await finishConnect(
    {
      state,
      code: url.searchParams.get("code") ?? undefined,
      error: url.searchParams.get("error") ?? undefined,
    },
    nonce,
    url.origin,
  );
  if (!location) {
    return fail({
      error: "invalid_request",
      issues: ["state: not this browser's"],
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL(location, url.origin).toString(),
      "set-cookie": `${NONCE_COOKIE}=; Path=/api/youtube/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
