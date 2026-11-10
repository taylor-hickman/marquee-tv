// The classify job (architecture 8): sets kind, artists, review status and
// eligibility on the performances ingest:new wrote as pending.
// scripts/ingest/classify/run.mts runs it.
import { sql } from "@/lib/db";
import { type Ask, decide } from "./decide";
import { asciiName, fold } from "./parse";

export type { Ask } from "./decide";

// A pending performance with no cache row (a premiere that hasn't aired, or
// one whose row expired) has no title yet and waits for refresh.
export async function classify(ask: Ask, seriesIds?: number[]) {
  const rows = await sql<
    {
      id: number;
      title: string;
      duration_s: number;
      name: string;
      title_rule: string;
    }[]
  >`
    select p.id, c.title, c.duration_s, s.name, s.title_rule
    from performance p
    join performance_yt_cache c on c.performance_id = p.id
    join series s on s.id = p.series_id
    where p.review_status = 'pending'
    ${seriesIds ? sql`and p.series_id in ${sql(seriesIds)}` : sql``}
    order by p.id`;

  const known = new Map<string, number>();
  for (const { id, text } of await sql<{ id: number; text: string }[]>`
    select id, name as text from artist
    union all select artist_id, alias from artist_alias
    order by id`) {
    if (!known.has(fold(text))) known.set(fold(text), id);
  }

  // `unreached` rows stay pending: the model couldn't be reached for them.
  const tally = {
    classified: 0,
    accepted: 0,
    flagged: 0,
    byModel: 0,
    unreached: 0,
  };
  for (const row of rows) {
    const decision = await decide(
      { title: row.title, durationS: row.duration_s },
      { name: row.name, titleRule: row.title_rule },
      known,
      ask,
    );
    if (decision.reviewStatus === "pending") {
      tally.unreached++;
      continue;
    }
    const created = await sql.begin(async (tx) => {
      const ids: number[] = [];
      const added = new Map<string, number>();
      for (const artist of decision.artists) {
        let id =
          artist.id ??
          known.get(fold(artist.name)) ??
          added.get(fold(artist.name));
        if (id === undefined) {
          [{ id }] = await tx<{ id: number }[]>`
            insert into artist ${tx({ name: artist.name })} returning id`;
          const alias = asciiName(artist.name);
          if (alias)
            await tx`insert into artist_alias ${tx({ artist_id: id, alias })}`;
          added.set(fold(artist.name), id);
        }
        if (!ids.includes(id)) ids.push(id);
      }
      await tx`delete from performance_artist where performance_id = ${row.id}`;
      if (ids.length > 0) {
        await tx`insert into performance_artist ${tx(
          ids.map((artist_id, i) => ({
            performance_id: row.id,
            artist_id,
            billing_order: i + 1,
          })),
        )}`;
      }
      // The same rule refresh uses when it restores a row.
      await tx`
        update performance set
          kind = ${decision.kind},
          review_status = ${decision.reviewStatus},
          eligible = ${decision.kind === "performance" && decision.reviewStatus === "accepted"}
        where id = ${row.id}`;
      return added;
    });
    for (const [key, id] of created) known.set(key, id);
    tally.classified++;
    tally[decision.reviewStatus]++;
    if (decision.via === "model") tally.byModel++;
  }
  return tally;
}
