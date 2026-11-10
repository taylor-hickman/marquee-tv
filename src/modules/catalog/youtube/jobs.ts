// The ingestion jobs that touch the YouTube API or its cache (architecture 8):
// ingest:new, refresh and expire. scripts/ingest/run.mts runs them.

import { sql } from "@/lib/db";
import type { Video, YouTube } from "./client";

// How long a cache row may be kept without a refresh, measured from fetched_at
// (DP III.E.4.d; docs/architecture/compliance-memo.md, question 1).
export const RETENTION_DAYS = 30;

type Series = { id: number; uploads_playlist_id: string; title_rule: string };

// Pages each series' uploads playlist, newest first, until it reaches a video
// already in the catalog, and writes a pending performance and its cache row
// for each new upload in the series. Series that share a channel share its
// uploads playlist, so each playlist is paged once.
export async function ingestNew(
  youtube: YouTube,
  now: Date,
  seriesIds?: number[],
) {
  const series = await sql<Series[]>`
    select id, uploads_playlist_id, title_rule from series
    ${seriesIds ? sql`where id in ${sql(seriesIds)}` : sql``}
    order by id`;
  let written = 0;
  for (const [playlist, members] of Map.groupBy(
    series,
    (s) => s.uploads_playlist_id,
  )) {
    const videos = await youtube.videos(await newUploads(youtube, playlist));
    const rows = videos.flatMap((video) => {
      const s = seriesFor(video.title, members);
      // A premiere or live stream has no duration until it has aired; a later
      // run picks it up.
      return s && video.durationS > 0 ? [{ video, seriesId: s.id }] : [];
    });
    if (rows.length === 0) continue;
    await sql.begin(async (tx) => {
      const performances = await tx`
        insert into performance ${tx(
          rows.map(({ video, seriesId }) => ({
            video_id: video.videoId,
            series_id: seriesId,
            review_status: "pending",
            last_verified_at: now,
          })),
        )}
        returning id, video_id`;
      const ids = new Map(performances.map((p) => [p.video_id, p.id]));
      await tx`insert into performance_yt_cache ${tx(
        rows.map(({ video }) => cacheRow(ids.get(video.videoId), video, now)),
      )}`;
    });
    written += rows.length;
  }
  return { written };
}

async function newUploads(youtube: YouTube, playlistId: string) {
  const fresh: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await youtube.playlistItems(playlistId, pageToken);
    const known = new Set(
      page.videoIds.length === 0
        ? []
        : (
            await sql`select video_id from performance where video_id in ${sql(page.videoIds)}`
          ).map((r) => r.video_id),
    );
    const firstKnown = page.videoIds.findIndex((id) => known.has(id));
    if (firstKnown >= 0) {
      fresh.push(...page.videoIds.slice(0, firstKnown));
      break;
    }
    fresh.push(...page.videoIds);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return fresh;
}

// An upload belongs to the series whose title rule's fixed text its title
// carries, ignoring case: "{artist}: Tiny Desk Concert" takes any title with
// "Tiny Desk Concert" in it. When several series match, the one with the most
// fixed text wins. Uploads that match no series are left out; A3 decides kind
// and artists for the rest.
function seriesFor(title: string, members: Series[]) {
  const lower = title.toLowerCase();
  let best: Series | undefined;
  let bestLength = -1;
  for (const s of members) {
    const fixed = s.title_rule
      .split(/\{[^}]*\}/)
      .map((part) => part.replace(/^[\s:|-]+|[\s:|-]+$/g, "").toLowerCase())
      .filter(Boolean);
    const length = fixed.join("").length;
    if (length > bestLength && fixed.every((part) => lower.includes(part))) {
      best = s;
      bestLength = length;
    }
  }
  return best;
}

// Re-fetches every performance's video: writes its cache row afresh, sets
// `available` and `last_verified_at`. A video videos.list no longer returns
// (deleted or private) becomes unavailable and keeps its old fetched_at, so
// expire removes its cache row 30 days on. A performance whose cache row had
// expired gets it back, and its eligibility with it.
export async function refresh(
  youtube: YouTube,
  now: Date,
  seriesIds?: number[],
) {
  const performances = await sql<
    { id: number; video_id: string; cached: boolean }[]
  >`
    select p.id, p.video_id, c.performance_id is not null as cached
    from performance p
    left join performance_yt_cache c on c.performance_id = p.id
    ${seriesIds ? sql`where p.series_id in ${sql(seriesIds)}` : sql``}`;
  const videos = new Map(
    (await youtube.videos(performances.map((p) => p.video_id)))
      .filter((v) => v.durationS > 0)
      .map((v) => [v.videoId, v]),
  );
  const found = performances.filter((p) => videos.has(p.video_id));
  const gone = performances.filter((p) => !videos.has(p.video_id));
  const restored = found.filter((p) => !p.cached);

  await sql.begin(async (tx) => {
    if (found.length > 0) {
      await tx`
        insert into performance_yt_cache ${tx(
          found.map((p) => cacheRow(p.id, videos.get(p.video_id)!, now)),
        )}
        on conflict (performance_id) do update set
          title = excluded.title,
          duration_s = excluded.duration_s,
          published_at = excluded.published_at,
          available = excluded.available,
          fetched_at = excluded.fetched_at`;
      await tx`
        update performance set last_verified_at = ${now}
        where id in ${tx(found.map((p) => p.id))}`;
    }
    if (restored.length > 0) {
      await tx`
        update performance
        set eligible = kind = 'performance' and review_status = 'accepted'
        where id in ${tx(restored.map((p) => p.id))}`;
    }
    if (gone.length > 0) {
      await tx`
        update performance_yt_cache set available = false
        where performance_id in ${tx(gone.map((p) => p.id))}`;
    }
  });
  return {
    checked: performances.length,
    available: found.filter((p) => videos.get(p.video_id)!.available).length,
    gone: gone.length,
    restored: restored.length,
  };
}

// Deletes cache rows fetched more than RETENTION_DAYS ago and makes their
// performances ineligible until a refresh brings the row back.
export async function expire(now: Date) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const expired = await sql`
    with expired as (
      delete from performance_yt_cache where fetched_at < ${cutoff}
      returning performance_id
    )
    update performance p set eligible = false
    from expired e where p.id = e.performance_id
    returning p.id`;
  return { expired: expired.length };
}

function cacheRow(performanceId: number, video: Video, now: Date) {
  return {
    performance_id: performanceId,
    title: video.title,
    duration_s: video.durationS,
    published_at: video.publishedAt,
    available: video.available,
    fetched_at: now,
  };
}
