// Loads db/fixtures/catalog.json into the local Supabase stack, replacing the
// catalog tables. Always targets the local stack: the connection comes from
// `supabase status`, never from DATABASE_URL.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";

type Catalog = {
  publishers: {
    id: number;
    name: string;
    channel_id: string;
    channel_url: string;
  }[];
  series: {
    id: number;
    publisher_id: number;
    name: string;
    uploads_playlist_id: string;
    title_rule: string;
    launch_depth: string;
    convention: string;
  }[];
  artists: {
    id: number;
    name: string;
    review_status: string;
    aliases: string[];
    profile: {
      genres: string[];
      scenes: string[];
      era: string;
      energy: number;
      similar_artist_ids: number[];
      source: string;
    };
  }[];
  performances: {
    id: number;
    artist_ids: number[];
    video_id: string;
    series_id: number;
    eligible: boolean;
    kind: string;
    review_status: string;
    last_verified_at: string;
    yt: {
      title: string;
      duration_s: number;
      published_at: string;
      available: boolean;
      fetched_at: string;
    };
  }[];
};

const catalog: Catalog = JSON.parse(
  readFileSync(
    new URL("../../db/fixtures/catalog.json", import.meta.url),
    "utf8",
  ),
);

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }),
);
const sql = postgres(status.DB_URL, { onnotice: () => {} });

const tables = [
  "publisher",
  "series",
  "artist",
  "artist_alias",
  "artist_profile",
  "performance",
  "performance_artist",
  "performance_yt_cache",
  "performance_tag",
];

await sql.begin(async (tx) => {
  await tx.unsafe(`truncate ${tables.join(", ")} restart identity cascade`);

  await tx`insert into publisher ${tx(catalog.publishers)}`;
  await tx`insert into series ${tx(catalog.series)}`;
  await tx`insert into artist ${tx(catalog.artists.map(({ id, name, review_status }) => ({ id, name, review_status })))}`;
  await tx`insert into artist_alias ${tx(catalog.artists.flatMap((a) => a.aliases.map((alias) => ({ artist_id: a.id, alias }))))}`;
  await tx`insert into artist_profile ${tx(catalog.artists.map((a) => ({ artist_id: a.id, ...a.profile })))}`;
  await tx`insert into performance ${tx(
    catalog.performances.map((p) => ({
      id: p.id,
      video_id: p.video_id,
      series_id: p.series_id,
      eligible: p.eligible,
      kind: p.kind,
      review_status: p.review_status,
      last_verified_at: p.last_verified_at,
    })),
  )}`;
  await tx`insert into performance_artist ${tx(
    catalog.performances.flatMap((p) =>
      p.artist_ids.map((artist_id, i) => ({
        performance_id: p.id,
        artist_id,
        billing_order: i + 1,
      })),
    ),
  )}`;
  await tx`insert into performance_yt_cache ${tx(catalog.performances.map((p) => ({ performance_id: p.id, ...p.yt })))}`;

  // Explicit ids leave the identity sequences behind; move them past the fixture.
  for (const table of ["publisher", "series", "artist", "performance"]) {
    await tx.unsafe(
      `select setval(pg_get_serial_sequence('${table}', 'id'), (select max(id) from ${table}))`,
    );
  }
});

const [counts] = await sql`
  select (select count(*) from performance)::int as performances,
         (select count(*) from performance_yt_cache)::int as cached,
         (select count(*) from artist)::int as artists
`;
console.log(
  `seeded ${counts.performances} performances (${counts.cached} cached), ${counts.artists} artists`,
);
await sql.end();
