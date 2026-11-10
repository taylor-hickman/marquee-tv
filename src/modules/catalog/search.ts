import "server-only";
import type {
  CatalogArtistsResponse,
  CatalogSearchRequest,
  CatalogSearchResponse,
} from "@/contracts";
import { sql } from "@/lib/db";
import { performanceCards } from "./cards";
import { cleared, HELD } from "./review";

export const SEARCH_PAGE_SIZE = 30;
export const TYPEAHEAD_LIMIT = 10;
export const CLOSEST_LIMIT = 3;

type TypeaheadArtist = { id: number; name: string; eligibleCount: number };

// Each word becomes a prefix match, so results arrive while the person types.
// Anything but letters and digits is dropped, which also keeps tsquery syntax out.
export function prefixQuery(q: string | undefined): string | null {
  const words = q?.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return words ? words.map((w) => `${w}:*`).join(" & ") : null;
}

// Playable performances matching the request, newest first, one row past the
// page so the caller knows whether another follows. Title and artist matches
// each use their full-text index, so the expressions match the migration's.
export function searchIdsQuery(request: CatalogSearchRequest) {
  const tsquery = prefixQuery(request.q);
  return sql<{ id: number }[]>`
    select p.id
    from performance p
    join performance_yt_cache c on c.performance_id = p.id
    join series s on s.id = p.series_id
    where p.eligible and c.available and ${cleared()}
      ${
        tsquery
          ? sql`and p.id in (
              select performance_id from performance_yt_cache
              where to_tsvector('simple', title) @@ to_tsquery('simple', ${tsquery})
              union
              select pa.performance_id
              from artist a
              join performance_artist pa on pa.artist_id = a.id
              where to_tsvector('simple', a.name) @@ to_tsquery('simple', ${tsquery}))`
          : sql``
      }
      ${request.publisherId ? sql`and s.publisher_id = ${request.publisherId}` : sql``}
      ${request.seriesId ? sql`and p.series_id = ${request.seriesId}` : sql``}
      ${
        request.artistId
          ? sql`and exists (select 1 from performance_artist pa
              where pa.performance_id = p.id and pa.artist_id = ${request.artistId})`
          : sql``
      }
    order by c.published_at desc, p.id desc
    limit ${SEARCH_PAGE_SIZE + 1} offset ${request.offset}`;
}

export async function search(
  request: CatalogSearchRequest,
): Promise<CatalogSearchResponse> {
  const rows = await searchIdsQuery(request);
  const page = rows.slice(0, SEARCH_PAGE_SIZE);
  return {
    performances: await performanceCards(page.map((r) => r.id)),
    nextOffset:
      rows.length > SEARCH_PAGE_SIZE ? request.offset + SEARCH_PAGE_SIZE : null,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

// Cleared artists whose name or an alias contains `q`, through the trigram indexes.
// Names that start with it come first, then artists with more to play. An
// artist with nothing to play carries up to three similar artists who have
// something, in the order of its profile's similar_artist_ids (PRD 7.2).
export function typeaheadQuery(q: string) {
  const contains = `%${escapeLike(q)}%`;
  const startsWith = `${escapeLike(q)}%`;
  return sql<(TypeaheadArtist & { closest: TypeaheadArtist[] | null })[]>`
    with matches as (
      select id as artist_id, name as text from artist where name ilike ${contains}
      union all
      select artist_id, alias from artist_alias where alias ilike ${contains}
    ), matched as (
      select artist_id, bool_or(text ilike ${startsWith}) as prefix
      from matches group by artist_id
    )
    select a.id, a.name, e.n as "eligibleCount",
      case when e.n = 0 then (
        select coalesce(json_agg(json_build_object(
          'id', s.id, 'name', s.name, 'eligibleCount', s.n) order by s.ord), '[]')
        from (
          select sa.id, sa.name, x.ord, se.n
          from artist_profile ap
          cross join unnest(ap.similar_artist_ids) with ordinality x(artist_id, ord)
          join artist sa on sa.id = x.artist_id
          cross join lateral (
            select count(*)::int as n
            from performance_artist pa
            join performance p on p.id = pa.performance_id
            join performance_yt_cache c on c.performance_id = p.id
            where pa.artist_id = sa.id and p.eligible and c.available and ${cleared()}
          ) se
          where ap.artist_id = a.id and se.n > 0
          order by x.ord
          limit ${CLOSEST_LIMIT}
        ) s
      ) end as closest
    from matched m
    join artist a on a.id = m.artist_id
    cross join lateral (
      select count(*)::int as n
      from performance_artist pa
      join performance p on p.id = pa.performance_id
      join performance_yt_cache c on c.performance_id = p.id
      where pa.artist_id = a.id and p.eligible and c.available and ${cleared()}
    ) e
    where a.review_status <> all(${HELD}::text[])
    order by m.prefix desc, e.n desc, a.name, a.id
    limit ${TYPEAHEAD_LIMIT}`;
}

export async function artistTypeahead(
  prefix: string,
): Promise<CatalogArtistsResponse["artists"]> {
  return (await typeaheadQuery(prefix)).map(({ closest, ...artist }) =>
    closest ? { ...artist, closest } : artist,
  );
}
