import { syncBuiltinESMExports } from "node:module";
import { setupServer } from "msw/node";
import { afterAll, afterEach } from "vitest";

// The PR gate reaches no third party (build plan 6.1). Requests to localhost,
// such as the local Supabase stack, pass through; any other request fails
// unless a test mocks it with server.use().
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const server = setupServer();

server.listen({
  async onUnhandledFrame({ frame, defaults }) {
    if (frame.protocol === "http") {
      const { request } = frame.data as { request: Request };
      if (localHosts.has(new URL(request.url).hostname)) return;
    }
    await defaults.error();
    // A thrown network error makes fetch reject, as an offline host would.
    throw Response.error();
  },
});
// Carry the patched http and https functions into named ESM imports too.
syncBuiltinESMExports();
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
