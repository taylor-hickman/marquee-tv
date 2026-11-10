import "server-only";
import type { ArtistId } from "@/contracts";
import { sql } from "@/lib/db";
import type { BriefCatalogContext } from "./types";

// What the brief step matches a request against (architecture 6.2 step 1): every
// publisher and series, and an artist lookup by exact name or alias. Case and
// surrounding spaces don't count; a partial name finds nothing.
export async function briefContext(): Promise<BriefCatalogContext> {
  const [publishers, series] = await Promise.all([
    sql<BriefCatalogContext["publishers"]>`
      select id, name from publisher order by id`,
    sql<BriefCatalogContext["series"]>`
      select id, publisher_id, name, convention from series order by id`,
  ]);
  return { publishers: [...publishers], series: [...series], artistIdFor };
}

async function artistIdFor(name: string): Promise<ArtistId | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const [row] = await sql<{ id: number }[]>`
    select id from artist where lower(name) = ${key}
    union
    select artist_id from artist_alias where lower(alias) = ${key}
    order by id
    limit 1`;
  return row?.id ?? null;
}
