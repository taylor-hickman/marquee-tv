// Recorded YouTube Data API responses (build plan 6.2), served by MSW so tests
// run without a key. The shapes are the API's; the IDs and titles are made up,
// because real titles are API Data and may not be kept past 30 days
// (docs/architecture/compliance-memo.md).
//
// FIXTURE_PLAYLIST is one uploads playlist shared by two series, paged three
// items at a time:
//   page1: 01 desk concert, 02 not in either series, 03 home concert
//   page2: 04 blocked in the US, 05 private (videos.list leaves it out),
//          06 an upcoming premiere with no duration yet
//   page3: 07, 08 desk concerts
// `videos.later.json` is the same channel a week on: 01 went private, 03 was
// retitled, 04's block lifted, 07 was deleted, 08 is no longer allowed in the
// US, and 09 and 10 are back for performances whose cache rows had expired.

import { getResponse, http, HttpResponse } from "msw";
import { vi } from "vitest";
import page1 from "./playlistItems.page1.json";
import page2 from "./playlistItems.page2.json";
import page3 from "./playlistItems.page3.json";
import videosNow from "./videos.json";
import videosLater from "./videos.later.json";

export const FIXTURE_PLAYLIST = "UUa2fixtureUploadsList00";
export const API = "https://www.googleapis.com/youtube/v3";

const pages: Record<string, object> = {
  "": page1,
  PAGE2: page2,
  PAGE3: page3,
};

const snapshots = { now: videosNow, later: videosLater };

// Replaces fetch with one that answers both endpoints from the fixtures,
// videos.list from the given snapshot, and returns the list of requested URLs.
// It stubs fetch rather than starting MSW's server, whose socket interceptor
// breaks the Postgres connection. Undo it with vi.unstubAllGlobals().
export function stubYouTube(snapshot: keyof typeof snapshots) {
  const requests: URL[] = [];
  const handlers = youtubeApi(snapshots[snapshot], requests);
  vi.stubGlobal("fetch", async (input: string) => {
    const response = await getResponse(handlers, new Request(input));
    if (!response) throw new Error(`No recorded response for ${input}`);
    return response;
  });
  return requests;
}

function youtubeApi(videos: typeof videosNow, requests: URL[]) {
  return [
    http.get(`${API}/playlistItems`, ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const page = pages[url.searchParams.get("pageToken") ?? ""];
      if (url.searchParams.get("playlistId") !== FIXTURE_PLAYLIST || !page) {
        return HttpResponse.json(
          { error: { code: 404, message: "The playlist could not be found." } },
          { status: 404 },
        );
      }
      return HttpResponse.json(page);
    }),
    http.get(`${API}/videos`, ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const ids = new Set(url.searchParams.get("id")!.split(","));
      const items = videos.items.filter((v) => ids.has(v.id));
      return HttpResponse.json({
        ...videos,
        items,
        pageInfo: { totalResults: items.length, resultsPerPage: items.length },
      });
    }),
  ];
}
