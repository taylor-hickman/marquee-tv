import "server-only";
import type { PerformanceCard, PerformanceId } from "@/contracts";
import { sql } from "@/lib/db";

type CardRow = {
  id: number;
  videoId: string;
  title: string | null;
  durationS: number | null;
  publishedAt: Date | null;
  artists: { id: number; name: string }[];
  seriesId: number;
  seriesName: string;
  publisherId: number;
  publisherName: string;
};

// One card per id, in the order of `ids`. The YouTube fields are null once the
// cache row has expired (architecture 5.3). An id with no performance or no
// artist yet has no card.
export async function performanceCards(
  ids: PerformanceId[],
): Promise<PerformanceCard[]> {
  if (ids.length === 0) return [];
  const rows = await sql<CardRow[]>`
    select p.id, p.video_id as "videoId",
      c.title, c.duration_s as "durationS", c.published_at as "publishedAt",
      artists.list as artists,
      s.id as "seriesId", s.name as "seriesName",
      pub.id as "publisherId", pub.name as "publisherName"
    from unnest(${ids}::bigint[]) with ordinality as wanted (id, ord)
    join performance p on p.id = wanted.id
    join series s on s.id = p.series_id
    join publisher pub on pub.id = s.publisher_id
    left join performance_yt_cache c on c.performance_id = p.id
    join lateral (
      select json_agg(json_build_object('id', a.id, 'name', a.name)
        order by pa.billing_order) as list
      from performance_artist pa
      join artist a on a.id = pa.artist_id
      where pa.performance_id = p.id
    ) artists on artists.list is not null
    order by wanted.ord`;
  return rows.map((r) => ({
    id: r.id,
    videoId: r.videoId,
    title: r.title,
    artists: r.artists,
    publisher: { id: r.publisherId, name: r.publisherName },
    series: { id: r.seriesId, name: r.seriesName },
    durationS: r.durationS,
    publishedAt: r.publishedAt?.toISOString() ?? null,
  }));
}
