// The YouTube Data API client. It calls playlistItems.list and videos.list and
// nothing else (PRD 9.3): no search.list, no channels.list. Each call costs one
// quota unit, counted in `units`.

const API = "https://www.googleapis.com/youtube/v3";

export type PlaylistPage = { videoIds: string[]; nextPageToken?: string };

// What the cache table keeps from a videos.list item (architecture 5.3).
export type Video = {
  videoId: string;
  title: string;
  durationS: number;
  publishedAt: Date;
  available: boolean;
};

type ApiVideo = {
  id: string;
  snippet: { title: string; publishedAt: string };
  contentDetails: {
    duration: string;
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  status: { privacyStatus: string; uploadStatus: string };
};

export type YouTube = ReturnType<typeof createYouTube>;

export function createYouTube(key: string) {
  const client = {
    units: 0,

    async playlistItems(
      playlistId: string,
      pageToken?: string,
    ): Promise<PlaylistPage> {
      const body = await get("playlistItems", {
        part: "contentDetails",
        playlistId,
        maxResults: "50",
        ...(pageToken && { pageToken }),
      });
      return {
        videoIds: body.items.map(
          (i: { contentDetails: { videoId: string } }) =>
            i.contentDetails.videoId,
        ),
        nextPageToken: body.nextPageToken,
      };
    },

    // Up to 50 IDs per call. Deleted and private videos don't come back.
    async videos(ids: string[]): Promise<Video[]> {
      const found: Video[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const body = await get("videos", {
          part: "snippet,contentDetails,status",
          id: ids.slice(i, i + 50).join(","),
          maxResults: "50",
        });
        found.push(...body.items.map(toVideo));
      }
      return found;
    },
  };

  async function get(method: string, params: Record<string, string>) {
    client.units += 1;
    const url = `${API}/${method}?${new URLSearchParams({ ...params, key })}`;
    const response = await fetch(url);
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        `YouTube ${method}.list ${response.status}: ${body.error?.message}`,
      );
    }
    return body;
  }

  return client;
}

function toVideo(v: ApiVideo): Video {
  return {
    videoId: v.id,
    title: v.snippet.title,
    durationS: seconds(v.contentDetails.duration),
    publishedAt: new Date(v.snippet.publishedAt),
    available: available(v),
  };
}

// ISO 8601 durations as videos.list writes them: PT1H2M3S, P1DT2H, P0D.
export function seconds(duration: string): number {
  const m = duration.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!m) throw new Error(`Unreadable duration ${duration}`);
  const [d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0));
  return d * 86_400 + h * 3_600 + min * 60 + s;
}

// Public, processed, and playable in the US, the launch market.
function available(v: ApiVideo): boolean {
  const region = v.contentDetails.regionRestriction;
  return (
    v.status.privacyStatus === "public" &&
    v.status.uploadStatus === "processed" &&
    !region?.blocked?.includes("US") &&
    (!region?.allowed || region.allowed.includes("US"))
  );
}
