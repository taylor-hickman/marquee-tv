import "server-only";
import type { PerformanceCard, PerformanceId } from "@/contracts";
import { sql } from "@/lib/db";

// Display data for the editor, one card per id in the order of `ids`. A local
// stand-in for catalog.performanceCards until A1 fills it in; switch the
// callers to it then and delete this file.
export async function performanceCards(
  ids: PerformanceId[],
): Promise<PerformanceCard[]> {
  if (ids.length === 0) return [];
  const rows = await sql<
    (Omit<PerformanceCard, "publishedAt"> & { publishedAt: Date | null })[]
  >`
    select p.id, p.video_id as "videoId", c.title, c.duration_s as "durationS",
      c.published_at as "publishedAt",
      json_build_object('id', pub.id, 'name', pub.name) as publisher,
      json_build_object('id', s.id, 'name', s.name) as series,
      coalesce((
        select json_agg(json_build_object('id', a.id, 'name', a.name)
          order by pa.billing_order)
        from performance_artist pa join artist a on a.id = pa.artist_id
        where pa.performance_id = p.id
      ), '[]') as artists
    from performance p
    join series s on s.id = p.series_id
    join publisher pub on pub.id = s.publisher_id
    left join performance_yt_cache c on c.performance_id = p.id
    where p.id = any(${ids})`;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [{ ...row, publishedAt: row.publishedAt?.toISOString() ?? null }]
      : [];
  });
}
