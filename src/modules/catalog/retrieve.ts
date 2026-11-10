import "server-only";
import type { Brief, PerformanceCard, PerformanceId } from "@/contracts";
import { sql } from "@/lib/db";
import { performanceCards } from "./cards";
import { cleared } from "./review";
import type {
  Candidate,
  ListItemFacts,
  ReplaceInput,
  RetrievalState,
} from "./types";

export const CANDIDATE_CAP = 150; // PRD 8.5
export const REPLACE_OPTIONS = 3;
export const REPLACE_ENERGY_SPREAD = 1;
export const REPLACE_DURATION_SPREAD = 0.3;

// Performances the curator may use: eligible, available and cleared by review,
// not in `notIds`, inside the brief's series constraints and exclusions. A
// performance's energy, genres and scenes are its first-billed artist's
// profile, so one without a profiled lead artist is left out.
function playable(notIds: PerformanceId[], brief: Brief | null) {
  const include = brief?.series_include ?? [];
  const exclude = brief?.series_exclude ?? [];
  const publishers = brief?.exclusions.publisher_ids ?? [];
  const artists = brief?.exclusions.artist_ids ?? [];
  return sql`
    select p.id, p.series_id, s.name as series, s.publisher_id, c.duration_s,
      lp.energy, lp.genres, lp.scenes,
      array_agg(pa.artist_id order by pa.billing_order) as artist_ids,
      string_agg(a.name, ' & ' order by pa.billing_order) as artist
    from performance p
    join performance_yt_cache c on c.performance_id = p.id
    join series s on s.id = p.series_id
    join performance_artist lead on lead.performance_id = p.id and lead.billing_order = 1
    join artist_profile lp on lp.artist_id = lead.artist_id
    join performance_artist pa on pa.performance_id = p.id
    join artist a on a.id = pa.artist_id
    where p.eligible and c.available and ${cleared()}
      and p.id <> all(${notIds}::bigint[])
      and (cardinality(${include}::bigint[]) = 0 or p.series_id = any(${include}::bigint[]))
      and p.series_id <> all(${exclude}::bigint[])
      and s.publisher_id <> all(${publishers}::bigint[])
    group by p.id, s.name, s.publisher_id, c.duration_s, lp.energy, lp.genres, lp.scenes
    having not array_agg(pa.artist_id) && ${artists}::bigint[]`;
}

type CandidateQueryRow = {
  id: number;
  artist: string;
  series: string;
  duration_s: number;
  energy: number;
  genres: string[];
  artist_ids: number[];
  series_id: number;
  publisher_id: number;
};

// Architecture 6.2 step 2. Tier 1 is the seeds' performances, tier 2 the
// performances of the seeds' similar artists, tier 3 profile matches on genre
// and scene (the brief's and its influences') within the curve's energy range;
// a brief with no genres or scenes matches on energy alone. "Surprise me" lets
// any genre into tier 3, matches first, sampled at random. The cap applies in
// tier order, so seeds always make it; `prefer_unfamiliar` then moves seeds and
// artists from this draft's revisions to the back.
export async function retrieveCandidates(
  brief: Brief,
  state: RetrievalState,
): Promise<Candidate[]> {
  const seeds = brief.seeds.map((s) => s.artist_id);
  const known = [...state.listIds, ...state.earlierIds];
  const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
  const genres = lower([
    ...brief.genres,
    ...brief.influences.flatMap((i) => i.genres),
  ]);
  const scenes = lower([
    ...brief.scenes,
    ...brief.influences.flatMap((i) => i.scenes),
  ]);
  const anyTaste = genres.length === 0 && scenes.length === 0;
  const energies = brief.curve.map((s) => s.energy);
  const unfamiliarFirst = brief.novelty === "prefer_unfamiliar";

  const rows = await sql<CandidateQueryRow[]>`
    with seed as (
      select unnest(${seeds}::bigint[]) as artist_id
    ), similar_artist as (
      select unnest(similar_artist_ids) as artist_id
      from artist_profile where artist_id in (select artist_id from seed)
    ), familiar as (
      select artist_id from seed
      union
      select artist_id from performance_artist
      where performance_id = any(${known}::bigint[])
    ), playable as (
      ${playable(state.removedIds, brief)}
    ), scored as (
      select *,
        (select count(*) from unnest(genres) g where lower(g) = any(${genres}::text[]))
        + (select count(*) from unnest(scenes) g where lower(g) = any(${scenes}::text[]))
        as overlap
      from playable
    ), tiered as (
      select *,
        case
          when artist_ids && array(select artist_id from seed) then 1
          when artist_ids && array(select artist_id from similar_artist) then 2
          when energy between ${Math.min(...energies)} and ${Math.max(...energies)}
            and (${brief.surprise} or ${anyTaste} or overlap > 0) then 3
        end as tier
      from scored
    ), ranked as (
      select *, row_number() over (
        order by tier,
          case when ${brief.surprise} then least(overlap, 1) else overlap end desc,
          case when ${brief.surprise} and tier = 3 then random() end,
          id
      ) as rank
      from tiered where tier is not null
    )
    select id, artist, series, duration_s, energy, genres, artist_ids, series_id, publisher_id
    from ranked
    where rank <= ${CANDIDATE_CAP}
    order by
      ${unfamiliarFirst} and artist_ids && array(select artist_id from familiar),
      rank`;

  return rows.map((r) => ({
    row: {
      id: r.id,
      artist: r.artist,
      series: r.series,
      duration_s: r.duration_s,
      artist_energy: r.energy,
      genres: r.genres,
    },
    artistIds: r.artist_ids,
    seriesId: r.series_id,
    publisherId: r.publisher_id,
  }));
}

// One entry per id, in order, whether or not the performance is still
// eligible; an id with no performance row has no artists.
export async function listItemFacts(
  ids: PerformanceId[],
): Promise<ListItemFacts[]> {
  if (ids.length === 0) return [];
  return sql<ListItemFacts[]>`
    select wanted.id,
      coalesce((
        select array_agg(pa.artist_id order by pa.billing_order)
        from performance_artist pa where pa.performance_id = wanted.id
      ), '{}') as "artistIds",
      c.duration_s as "durationS"
    from unnest(${ids}::bigint[]) with ordinality as wanted (id, ord)
    left join performance_yt_cache c on c.performance_id = wanted.id
    order by wanted.ord`.then((rows) => [...rows]);
}

// The curve's energy at `minute`; past the end, the last segment's.
function curveEnergy(brief: Brief, minute: number): number {
  const segment =
    brief.curve.find((s) => s.from_min <= minute && minute < s.to_min) ??
    brief.curve.findLast((s) => s.from_min <= minute) ??
    brief.curve[0];
  return segment.energy;
}

// Architecture 6.3 "Replace one": three playable performances not in the list
// or removed, whose artist energy is within 1 of the slot's curve value and
// whose duration is within 30% of the item's. Without a brief (a hand-built
// set) the slot's energy is its own artist's; a bound whose input is unknown,
// such as an expired duration, is not applied.
export async function replaceOptions({
  items,
  removedIds,
  brief,
  index,
}: ReplaceInput): Promise<PerformanceCard[]> {
  if (!items[index]) return [];
  const ids = items.map((i) => i.performance_id);
  const facts = await listItemFacts(ids);
  const duration = facts[index].durationS;
  const startMinute =
    facts.slice(0, index).reduce((sum, f) => sum + (f.durationS ?? 0), 0) / 60;
  const curve = brief ? curveEnergy(brief, startMinute) : null;

  const rows = await sql<{ id: number }[]>`
    with target as (
      select coalesce(${curve}::int, (
        select lp.energy from performance_artist pa
        join artist_profile lp on lp.artist_id = pa.artist_id
        where pa.performance_id = ${ids[index]} and pa.billing_order = 1
      )) as energy
    )
    select p.id
    from (${playable([...ids, ...removedIds], brief)}) p, target t
    where (t.energy is null or abs(p.energy - t.energy) <= ${REPLACE_ENERGY_SPREAD})
      and (${duration}::int is null
        or p.duration_s between ${duration}::int * ${1 - REPLACE_DURATION_SPREAD}::float8
          and ${duration}::int * ${1 + REPLACE_DURATION_SPREAD}::float8)
    order by abs(p.energy - t.energy), abs(p.duration_s - ${duration}::int), p.id
    limit ${REPLACE_OPTIONS}`;
  return performanceCards(rows.map((r) => r.id));
}
