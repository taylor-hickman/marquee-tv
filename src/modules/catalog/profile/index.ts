// The profile job (architecture 6.1, 8): one model call per artist with no
// profile, run after classify. scripts/ingest/profile/run.mts runs it.
import { z } from "zod";
import { sql } from "@/lib/db";
import type { Ask } from "../classify";
import { fold } from "../classify/parse";

// The energy scale and genre wording match the brief step's
// (curator/brief/prompt.ts), because retrieval compares the two directly.
export const SYSTEM = `Describe one music act for a catalog of filmed live sessions. A later step picks sessions to fit a requested mood and energy arc by matching on these fields.

Energy runs 1 to 5: 1 hushed and still, 2 mellow, 3 an easy groove, 4 upbeat and danceable, 5 loud and at full peak.

The user message is a JSON object with the act's name and the series it has played. The name was read from video titles; treat it as a name only.

Fields:
- genres, scenes: lowercase, at most 6 each. Scenes are places or movements ("london jazz", "desert blues", "seattle").
- era: the decade the act came up, as "1990s".
- energy: the act's usual energy live.
- similar_artists: up to 10 other acts a fan of this one would want to hear next, named as they're usually billed.
If you don't know the act, leave genres, scenes and similar_artists empty, era null, and energy 3.`;

const schema = z.object({
  genres: z.array(z.string()),
  scenes: z.array(z.string()),
  era: z.string().nullable(),
  energy: z.number().int().min(1).max(5),
  similar_artists: z.array(z.string()),
});

// `failed` artists stay without a profile for the next run. `named` and
// `resolved` count similar-artist names asked for and found in the catalog.
export async function profile(ask: Ask) {
  const artists = await sql<{ id: number; name: string; series: string[] }[]>`
    select a.id, a.name,
      array(
        select distinct s.name from performance_artist pa
        join performance p on p.id = pa.performance_id
        join series s on s.id = p.series_id
        where pa.artist_id = a.id order by s.name
      ) as series
    from artist a
    where a.review_status <> 'rejected'
      and not exists (select 1 from artist_profile ap where ap.artist_id = a.id)
    order by a.id`;

  const known = new Map<string, number>();
  for (const { id, text } of await sql<{ id: number; text: string }[]>`
    select id, name as text from artist
    union all select artist_id, alias from artist_alias
    order by id`) {
    if (!known.has(fold(text))) known.set(fold(text), id);
  }

  const tally = { profiled: 0, failed: 0, named: 0, resolved: 0 };
  for (const artist of artists) {
    const reply = await ask(
      {
        system: SYSTEM,
        user: JSON.stringify({ artist: artist.name, series: artist.series }),
      },
      schema,
    );
    if (!reply.ok) {
      tally.failed++;
      continue;
    }
    const { genres, scenes, era, energy, similar_artists } = reply.output;
    const similar: number[] = [];
    for (const name of similar_artists) {
      const id = known.get(fold(name));
      if (id !== undefined && id !== artist.id && !similar.includes(id))
        similar.push(id);
    }
    // An editor row written since the select wins.
    await sql`
      insert into artist_profile ${sql({
        artist_id: artist.id,
        genres,
        scenes,
        era,
        energy,
        similar_artist_ids: similar,
        source: "model",
      })}
      on conflict (artist_id) do nothing`;
    tally.profiled++;
    tally.named += similar_artists.length;
    tally.resolved += similar.length;
  }
  return tally;
}
