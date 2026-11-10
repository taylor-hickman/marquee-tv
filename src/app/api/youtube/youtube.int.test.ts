import { sql } from "@/test/db";
import { randomBytes } from "node:crypto";
import { getResponse, http, HttpResponse } from "msw";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  errorBody,
  urlResponse,
  youtubeConnectionResponse,
  youtubeExportResponse,
} from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import { catalogIds, draftAt } from "@/modules/playlist/testing";
import { POST as exportRoute } from "../drafts/[id]/youtube-export/route";
import { GET as callback } from "./callback/route";
import { POST as connect } from "./connect/route";
import { DELETE as disconnect, GET as connection } from "./connection/route";

vi.mock("server-only", () => ({}));

process.env.GOOGLE_OAUTH_CLIENT_ID = "client.apps.googleusercontent.com";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
process.env.YOUTUBE_TOKEN_KEY = randomBytes(32).toString("base64");

const SCOPE = "https://www.googleapis.com/auth/youtube";
const ORIGIN = "http://localhost";
const REFRESH = "1//refresh-token-from-google";

// Google, mocked. Each test can make an endpoint fail; every call is kept.
type Call = { path: string; body: unknown };
let calls: Call[] = [];
let refresh: "ok" | "invalid_grant" = "ok";
let failItem: { at: number; status: number; reason: string } | null = null;
let items = 0;
const google = [
  http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    calls.push({ path: "token", body: Object.fromEntries(form) });
    if (form.get("grant_type") === "authorization_code") {
      return HttpResponse.json({
        access_token: "access",
        refresh_token: REFRESH,
        scope: form.get("code") === "no-scope" ? "openid" : SCOPE,
      });
    }
    return refresh === "ok"
      ? HttpResponse.json({ access_token: "access" })
      : HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
  }),
  http.post("https://oauth2.googleapis.com/revoke", async ({ request }) => {
    calls.push({ path: "revoke", body: await request.text() });
    return new HttpResponse(null, { status: 200 });
  }),
  http.post(
    "https://www.googleapis.com/youtube/v3/playlists",
    async ({ request }) => {
      calls.push({ path: "playlists", body: await request.json() });
      return HttpResponse.json({ id: "PLnew" });
    },
  ),
  http.post(
    "https://www.googleapis.com/youtube/v3/playlistItems",
    async ({ request }) => {
      const body = (await request.json()) as {
        snippet: { playlistId: string; resourceId: { videoId: string } };
      };
      calls.push({ path: "playlistItems", body });
      if (items++ === failItem?.at) {
        const { status, reason } = failItem;
        return HttpResponse.json(
          { error: { code: status, errors: [{ reason }] } },
          { status },
        );
      }
      return HttpResponse.json({ id: `PLI${items}`, snippet: body.snippet });
    },
  ),
];

// MSW's socket interceptor breaks the Postgres connection, so fetch is stubbed
// as in the ingest tests (src/modules/catalog/youtube/fixtures). Localhost,
// the stack's Auth, goes through.
const realFetch = globalThis.fetch;
beforeAll(() =>
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const request = new Request(input, init);
    return (await getResponse(google, request)) ?? realFetch(request);
  }),
);
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  calls = [];
  refresh = "ok";
  failItem = null;
  items = 0;
  await sql`update app_flag set value = 'api' where key = 'handoff_mode'`;
});
afterEach(async () => {
  await sql`update app_flag set value = 'url' where key = 'handoff_mode'`;
});

const json = (headers: Record<string, string>, body: unknown) => ({
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify(body),
});

const startConnect = (headers: Record<string, string>, draftId: string) =>
  connect(
    new Request(`${ORIGIN}/api/youtube/connect`, json(headers, { draftId })),
  );

const finish = (query: Record<string, string>, cookie?: string) =>
  callback(
    new Request(
      `${ORIGIN}/api/youtube/callback?${new URLSearchParams(query)}`,
      {
        headers: cookie ? { cookie } : {},
      },
    ),
  );

const save = (headers: Record<string, string>, id: string, baseRevision = 1) =>
  exportRoute(
    new Request(
      `${ORIGIN}/api/drafts/${id}/youtube-export`,
      json(headers, { baseRevision }),
    ),
    { params: Promise.resolve({ id }) },
  );

// A signed-in user with a three-track draft, connected through the routes.
async function connected() {
  const user = await asUser();
  const ids = await catalogIds(3);
  const draftId = await draftAt(ids, {
    owner_user_id: user.userId,
    owner_guest_id: null,
    title: "Slow burn",
  });
  const started = await startConnect(user.headers, draftId);
  const { url } = urlResponse.parse(await started.json());
  const cookie = started.headers.get("set-cookie")!.split(";")[0];
  const state = new URL(url).searchParams.get("state")!;
  const back = await finish({ code: "auth-code", state }, cookie);
  expect(back.headers.get("location")).toBe(
    `${ORIGIN}/d/${draftId}?youtube=save`,
  );
  const rows = await sql<{ id: number; video_id: string }[]>`
    select id, video_id from performance where id = any(${ids})`;
  const videoOf = new Map(rows.map((r) => [r.id, r.video_id]));
  return { ...user, draftId, videoIds: ids.map((id) => videoOf.get(id)!) };
}

const inserted = () =>
  calls
    .filter((c) => c.path === "playlistItems")
    .map(
      (c) =>
        (c.body as { snippet: { resourceId: { videoId: string } } }).snippet
          .resourceId.videoId,
    );

describe("POST /api/youtube/connect", () => {
  test("sends a signed-in owner to Google's consent for the youtube scope only", async () => {
    const user = await asUser();
    const draftId = await draftAt(await catalogIds(1), {
      owner_user_id: user.userId,
      owner_guest_id: null,
    });
    const response = await startConnect(user.headers, draftId);
    expect(response.status).toBe(200);
    const url = new URL(urlResponse.parse(await response.json()).url);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      scope: SCOPE,
      access_type: "offline",
      include_granted_scopes: "true",
      redirect_uri: `${ORIGIN}/api/youtube/callback`,
    });
    expect(response.headers.get("set-cookie")).toMatch(
      /^yt_oauth_nonce=[^;]+; Path=\/api\/youtube\/callback; HttpOnly/,
    );
  });

  test("a guest gets 401, and the route is off unless handoff_mode is api", async () => {
    const guest = await asGuest();
    const draftId = await draftAt(await catalogIds(1), {
      owner_guest_id: guest.guestId,
    });
    expect((await startConnect(guest.headers, draftId)).status).toBe(401);

    const user = await asUser();
    const own = await draftAt(await catalogIds(1), {
      owner_user_id: user.userId,
      owner_guest_id: null,
    });
    await sql`update app_flag set value = 'url' where key = 'handoff_mode'`;
    expect((await startConnect(user.headers, own)).status).toBe(404);
  });
});

describe("GET /api/youtube/callback", () => {
  test("stores the refresh token encrypted, never in the clear", async () => {
    const { userId } = await connected();
    const [row] = await sql<{ refresh_token: Buffer }[]>`
      select refresh_token from youtube_connection where user_id = ${userId}`;
    expect(row.refresh_token.toString("latin1")).not.toContain(REFRESH);
  });

  test("refuses a state without this browser's nonce cookie", async () => {
    const user = await asUser();
    const draftId = await draftAt(await catalogIds(1), {
      owner_user_id: user.userId,
      owner_guest_id: null,
    });
    const started = await startConnect(user.headers, draftId);
    const state = new URL(
      urlResponse.parse(await started.json()).url,
    ).searchParams.get("state")!;
    const forged = await finish(
      { code: "auth-code", state },
      "yt_oauth_nonce=someone-else",
    );
    expect(forged.status).toBe(400);
    expect(calls).toEqual([]);
  });

  test("a declined consent, or one without the youtube scope, stores nothing", async () => {
    const user = await asUser();
    const draftId = await draftAt(await catalogIds(1), {
      owner_user_id: user.userId,
      owner_guest_id: null,
    });
    const declined: Record<string, string>[] = [
      { error: "access_denied" },
      { code: "no-scope" },
    ];
    for (const query of declined) {
      const started = await startConnect(user.headers, draftId);
      const cookie = started.headers.get("set-cookie")!.split(";")[0];
      const state = new URL(
        urlResponse.parse(await started.json()).url,
      ).searchParams.get("state")!;
      const back = await finish({ ...query, state }, cookie);
      expect(back.headers.get("location")).toBe(`${ORIGIN}/d/${draftId}`);
    }
    const [row] = await sql`
      select 1 from youtube_connection where user_id = ${user.userId}`;
    expect(row).toBeUndefined();
  });
});

describe("POST /api/drafts/:id/youtube-export", () => {
  test("creates one private playlist with the revision's videos in order", async () => {
    const user = await connected();
    const response = await save(user.headers, user.draftId);
    expect(response.status).toBe(200);
    expect(youtubeExportResponse.parse(await response.json())).toEqual({
      status: "done",
      playlistId: "PLnew",
      url: "https://www.youtube.com/playlist?list=PLnew",
    });
    expect(calls.find((c) => c.path === "playlists")?.body).toMatchObject({
      snippet: { title: "Slow burn" },
      status: { privacyStatus: "private" },
    });
    expect(inserted()).toEqual(user.videoIds);
  });

  test("a second tap on the same revision returns the same playlist", async () => {
    const user = await connected();
    await save(user.headers, user.draftId);
    calls = [];
    const again = await save(user.headers, user.draftId);
    expect(youtubeExportResponse.parse(await again.json())).toMatchObject({
      playlistId: "PLnew",
    });
    expect(calls).toEqual([]);
  });

  test("a failure mid-export resumes from the item it stopped at", async () => {
    const user = await connected();
    failItem = { at: 1, status: 500, reason: "backendError" };
    const failed = await save(user.headers, user.draftId);
    expect(failed.status).toBe(502);
    expect(errorBody.parse(await failed.json())).toEqual({
      error: "youtube_failed",
    });
    calls = [];
    failItem = null;
    const retried = await save(user.headers, user.draftId);
    expect(retried.status).toBe(200);
    expect(calls.some((c) => c.path === "playlists")).toBe(false);
    expect(inserted()).toEqual(user.videoIds.slice(1));
  });

  test("skips a video YouTube no longer has, but fails when the playlist is gone", async () => {
    const user = await connected();
    failItem = { at: 1, status: 404, reason: "videoNotFound" };
    const skipped = await save(user.headers, user.draftId);
    expect(skipped.status).toBe(200);
    expect(inserted()).toEqual(user.videoIds);

    const other = await connected();
    calls = [];
    items = 0;
    failItem = { at: 0, status: 404, reason: "playlistNotFound" };
    const failed = await save(other.headers, other.draftId);
    expect(failed.status).toBe(502);
    expect(inserted()).toEqual(other.videoIds.slice(0, 1));
  });

  test("no grant, or one Google revoked, asks the client to connect", async () => {
    const user = await asUser();
    const draftId = await draftAt(await catalogIds(1), {
      owner_user_id: user.userId,
      owner_guest_id: null,
    });
    const none = await save(user.headers, draftId);
    expect(none.status).toBe(403);
    expect(await none.json()).toEqual({ error: "youtube_not_connected" });

    const revoked = await connected();
    refresh = "invalid_grant";
    const response = await save(revoked.headers, revoked.draftId);
    expect(await response.json()).toEqual({ error: "youtube_not_connected" });
    const [row] = await sql`
      select 1 from youtube_connection where user_id = ${revoked.userId}`;
    expect(row).toBeUndefined();
  });

  test("a stale baseRevision gets 409, and a guest 401", async () => {
    const user = await connected();
    expect((await save(user.headers, user.draftId, 2)).status).toBe(409);
    const guest = await asGuest();
    const draftId = await draftAt(await catalogIds(1), {
      owner_guest_id: guest.guestId,
    });
    expect((await save(guest.headers, draftId)).status).toBe(401);
  });
});

describe("/api/youtube/connection", () => {
  test("DELETE revokes the grant at Google and forgets it", async () => {
    const user = await connected();
    const status = () =>
      connection(
        new Request(`${ORIGIN}/api/youtube/connection`, {
          headers: user.headers,
        }),
      );
    expect(
      youtubeConnectionResponse.parse(await (await status()).json()),
    ).toEqual({ connected: true });
    calls = [];
    const response = await disconnect(
      new Request(`${ORIGIN}/api/youtube/connection`, {
        method: "DELETE",
        headers: user.headers,
      }),
    );
    expect(await response.json()).toEqual({ connected: false });
    expect(calls).toEqual([
      { path: "revoke", body: `token=${encodeURIComponent(REFRESH)}` },
    ]);
    expect(await (await status()).json()).toEqual({ connected: false });
  });
});
