// Writes db/fixtures/catalog.json: 300 synthetic performances across three
// publishers and six series. Deterministic, so a rerun reproduces the same file.
// Video and channel ids are made up; artist names are real so the curator has
// something plausible to reason about.
//
//   node scripts/seed/generate-fixture.mts && pnpm prettier --write db/fixtures/catalog.json

import { writeFileSync } from "node:fs";

const OUT = new URL("../../db/fixtures/catalog.json", import.meta.url);
const FETCHED_AT = "2026-11-01T00:00:00Z";

let state = 0x2b2b2b2b;
function random() {
  // mulberry32
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T,>(items: readonly T[]) =>
  items[Math.floor(random() * items.length)];
const ID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const randomId = (length: number) =>
  Array.from({ length }, () => pick([...ID_CHARS])).join("");

type Publisher = "npr" | "kexp" | "colors";

const publishers = [
  {
    key: "npr",
    name: "NPR Music",
    channel_url: "https://www.youtube.com/@nprmusic",
  },
  { key: "kexp", name: "KEXP", channel_url: "https://www.youtube.com/@kexp" },
  {
    key: "colors",
    name: "COLORS",
    channel_url: "https://www.youtube.com/@COLORSxSTUDIOS",
  },
].map((p, i) => ({ id: i + 1, ...p, channel_id: `UC${randomId(22)}` }));

const seriesDefs = [
  {
    publisher: "npr",
    name: "Tiny Desk Concerts",
    title_rule: "{artist}: Tiny Desk Concert",
    launch_depth: "full",
    convention: "stripped-down, behind a desk in a small office",
    count: 110,
    minutes: [12, 26],
    years: [2012, 2025],
  },
  {
    publisher: "npr",
    name: "Tiny Desk Home Concerts",
    title_rule: "{artist}: Tiny Desk (Home) Concert",
    launch_depth: "thin",
    convention: "filmed at home or on location, often a fuller band",
    count: 30,
    minutes: [10, 22],
    years: [2020, 2022],
  },
  {
    publisher: "kexp",
    name: "Live on KEXP",
    title_rule: "{artist} - Full Performance (Live on KEXP)",
    launch_depth: "full",
    convention: "full band live in a radio studio, loud and raw",
    count: 90,
    minutes: [15, 32],
    years: [2012, 2026],
  },
  {
    publisher: "kexp",
    name: "KEXP at Home",
    title_rule: "{artist} - Full Performance (Live on KEXP at Home)",
    launch_depth: "thin",
    convention: "full band recorded remotely in the artist's own space",
    count: 15,
    minutes: [14, 26],
    years: [2020, 2021],
  },
  {
    publisher: "colors",
    name: "A COLORS SHOW",
    title_rule: "{artist} - {song} | A COLORS SHOW",
    launch_depth: "full",
    convention: "one voice and a beat, one song, minimal colored backdrop",
    count: 45,
    minutes: [2.5, 5],
    years: [2017, 2026],
  },
  {
    publisher: "colors",
    name: "A COLORS ENCORE",
    title_rule: "{artist} - {song} | A COLORS ENCORE",
    launch_depth: "thin",
    convention: "a second song after a COLORS SHOW, same minimal setup",
    count: 10,
    minutes: [2.5, 5],
    years: [2019, 2026],
  },
] as const;

const series = seriesDefs.map((s, i) => {
  const publisher = publishers.find((p) => p.key === s.publisher)!;
  return {
    id: i + 1,
    publisher_id: publisher.id,
    name: s.name,
    uploads_playlist_id: `UU${publisher.channel_id.slice(2)}`,
    title_rule: s.title_rule,
    launch_depth: s.launch_depth,
    convention: s.convention,
  };
});

// name | genres | scenes | era | energy | publishers (n = NPR, k = KEXP, c = COLORS) | aliases
const ARTISTS = `
Khruangbin|psychedelic,funk,global|houston|2010s|3|nk|
Anderson .Paak|funk,soul,hip-hop|los angeles|2010s|4|nk|Anderson .Paak & The Free Nationals
Mac Miller|hip-hop,jazz rap|pittsburgh|2010s|2|n|
Tyler, The Creator|hip-hop|los angeles|2010s|4|n|Tyler The Creator
Billie Eilish|pop,alt pop|los angeles|2010s|2|nc|
Phoebe Bridgers|indie folk,indie rock|los angeles|2010s|1|nk|
Mitski|indie rock,art pop|new york|2010s|3|nk|
Japanese Breakfast|indie pop,indie rock|philadelphia|2010s|3|nk|
Big Thief|indie folk,indie rock|brooklyn|2010s|2|nk|
Fleet Foxes|indie folk|seattle|2000s|2|nk|
Car Seat Headrest|indie rock|seattle|2010s|4|k|
IDLES|post-punk,punk|bristol|2010s|5|k|
Fontaines D.C.|post-punk|dublin|2010s|4|k|Fontaines DC
King Gizzard & the Lizard Wizard|psychedelic rock,garage rock|melbourne|2010s|5|k|King Gizzard
Tinariwen|desert blues,global|sahara|2000s|3|nk|
Bombino|desert blues,global|agadez|2010s|3|nk|
Altin Gün|psychedelic,anatolian rock,global|amsterdam|2010s|4|k|Altin Gun
Mdou Moctar|desert blues,psychedelic rock|agadez|2010s|4|k|
Sharon Van Etten|indie rock,singer-songwriter|new york|2010s|2|nk|
Courtney Barnett|indie rock|melbourne|2010s|3|k|
Angel Olsen|indie rock,singer-songwriter|asheville|2010s|2|nk|
Snail Mail|indie rock|baltimore|2010s|3|k|
Soccer Mommy|indie rock|nashville|2010s|2|nk|
Black Pumas|soul,psychedelic soul|austin|2010s|3|nk|
Durand Jones & The Indications|soul|bloomington|2010s|3|k|
Lizzo|pop,r&b,hip-hop|minneapolis|2010s|5|n|
H.E.R.|r&b|bay area|2010s|2|nc|HER
SZA|r&b|st. louis|2010s|2|c|
Daniel Caesar|r&b,soul|toronto|2010s|1|nc|
Jorja Smith|r&b,soul|walsall|2010s|2|nc|
Kehlani|r&b|oakland|2010s|3|c|
Masego|jazz,r&b|virginia|2010s|3|nc|
Tom Misch|jazz,funk,neo-soul|london|2010s|3|nc|
Jacob Collier|jazz,pop|london|2010s|3|n|
Snarky Puppy|jazz fusion,funk|brooklyn|2010s|4|n|
Cory Wong|funk|minneapolis|2010s|4|n|
Vulfpeck|funk|ann arbor|2010s|4|n|
Thundercat|jazz fusion,funk|los angeles|2010s|3|nc|
Kamasi Washington|jazz,spiritual jazz|los angeles|2010s|3|nk|
Hiatus Kaiyote|neo-soul,future soul|melbourne|2010s|3|nk|
Cleo Sol|neo-soul,soul|london|2020s|1|c|
Little Simz|hip-hop,grime|london|2010s|4|nc|
Stormzy|grime,hip-hop|london|2010s|5|c|
Dave|hip-hop,uk rap|london|2010s|3|c|Santan Dave
Kojey Radical|hip-hop,uk rap|london|2010s|4|c|
slowthai|hip-hop,grime|northampton|2010s|5|c|
Arlo Parks|indie pop,neo-soul|london|2020s|2|nc|
Celeste|soul|london|2020s|1|c|
Mahalia|r&b|leicester|2010s|2|c|
Burna Boy|afrobeats,afrofusion|lagos|2010s|4|nc|
Tems|afrobeats,r&b|lagos|2020s|2|c|
Wizkid|afrobeats|lagos|2010s|4|c|
Rema|afrobeats|benin city|2020s|4|c|
Ayra Starr|afrobeats,afropop|lagos|2020s|4|c|
Tiwa Savage|afrobeats|lagos|2010s|4|c|
Sampa the Great|hip-hop|lusaka|2010s|4|kc|
Koffee|reggae,dancehall|kingston|2010s|4|nc|
Chronixx|reggae|kingston|2010s|3|n|
Nilüfer Yanya|indie rock,alt r&b|london|2010s|3|kc|Nilufer Yanya
Rina Sawayama|pop|london|2020s|4|c|
Kali Uchis|r&b,latin pop|bogotá|2010s|3|nc|
Bad Bunny|latin trap,reggaeton|san juan|2010s|5|n|
Natalia Lafourcade|latin folk,son jarocho|veracruz|2000s|2|n|
Ed Maverick|latin folk|chihuahua|2010s|1|nc|
Bomba Estéreo|cumbia,electronic|bogotá|2010s|5|nk|Bomba Estereo
Ibeyi|afro-cuban,electronic soul|paris|2010s|3|kc|
Fatoumata Diawara|wassoulou,afropop|bamako|2010s|4|nk|
Angélique Kidjo|afropop,global|cotonou|1990s|5|nk|Angelique Kidjo
Seun Kuti & Egypt 80|afrobeat|lagos|2000s|5|k|Seun Kuti
Ezra Collective|jazz,afrobeat|london|2010s|5|kc|
Nubya Garcia|jazz|london|2010s|3|kc|
Moses Sumney|art soul,experimental|los angeles|2010s|1|kc|
Sudan Archives|experimental r&b|cincinnati|2010s|3|kc|
Yaeji|house,electronic|new york|2010s|4|kc|
Bonobo|downtempo,electronic|london|2000s|3|k|
Caribou|electronic,psychedelic|dundas|2000s|4|k|
Floating Points|electronic|manchester|2010s|3|k|
Kaytranada|house,electronic r&b|montreal|2010s|4|c|
Channel Tres|house,hip-hop|compton|2010s|4|c|
Fred again..|electronic,house|london|2020s|4|c|Fred again
Jungle|funk,disco|london|2010s|4|k|
Parcels|funk,disco|byron bay|2010s|4|kc|
Glass Animals|indie pop,psychedelic pop|oxford|2010s|3|k|
Unknown Mortal Orchestra|psychedelic rock,funk|portland|2010s|3|k|UMO
Mac DeMarco|indie rock,slacker rock|edmonton|2010s|2|nk|
Men I Trust|dream pop|montreal|2010s|2|k|
Beach House|dream pop|baltimore|2000s|2|k|
Alvvays|indie pop,dream pop|toronto|2010s|3|k|
Wet Leg|indie rock,post-punk|isle of wight|2020s|4|k|
black midi|experimental rock,math rock|london|2010s|5|k|Black Midi
Shame|post-punk|london|2010s|5|k|
Turnstile|hardcore punk|baltimore|2010s|5|k|
Thee Sacred Souls|soul|san diego|2020s|2|k|
Lake Street Dive|soul,pop rock|boston|2010s|3|nk|
Tank and the Bangas|funk,soul,spoken word|new orleans|2010s|4|n|
Trombone Shorty|funk,jazz,brass|new orleans|2000s|5|nk|
Preservation Hall Jazz Band|new orleans jazz,brass|new orleans|1960s|4|n|
Tedeschi Trucks Band|blues rock,soul|jacksonville|2010s|4|n|
Gary Clark Jr.|blues rock|austin|2010s|4|nk|Gary Clark Jr
Leon Bridges|soul,retro soul|fort worth|2010s|2|nk|
Allison Russell|americana,roots|montreal|2020s|2|n|
Rhiannon Giddens|americana,folk|greensboro|2010s|2|n|
Tyler Childers|country,appalachian|kentucky|2010s|2|n|
Sierra Ferrell|country,folk|west virginia|2020s|2|nk|
Billy Strings|bluegrass|michigan|2010s|4|n|
Watchhouse|folk|north carolina|2010s|1|n|Mandolin Orange
Adrianne Lenker|indie folk|brooklyn|2010s|1|nk|
Bon Iver|indie folk|eau claire|2000s|2|n|
Lianne La Havas|soul,folk|london|2010s|2|nkc|
Cautious Clay|r&b,indie pop|cleveland|2010s|2|c|
Rex Orange County|indie pop|haslemere|2010s|2|nc|
Joy Crookes|soul,r&b|london|2020s|2|c|
Raveena|r&b|new york|2010s|1|c|
Noname|hip-hop,jazz rap|chicago|2010s|3|n|
Saba|hip-hop|chicago|2010s|3|nc|
Smino|hip-hop|st. louis|2010s|4|nc|
Denzel Curry|hip-hop|miami|2010s|5|nc|
JID|hip-hop|atlanta|2010s|5|c|J.I.D
Rapsody|hip-hop|north carolina|2010s|3|n|
Megan Thee Stallion|hip-hop|houston|2010s|5|n|
Lucky Daye|r&b|new orleans|2010s|3|c|
Steve Lacy|alt r&b,funk|compton|2010s|3|nc|
Omar Apollo|r&b,latin pop|indiana|2010s|2|nc|
The Marías|dream pop,latin|los angeles|2010s|2|k|The Marias
Hermanos Gutiérrez|instrumental,cinematic|zurich|2010s|1|k|Hermanos Gutierrez
Les Amazones d'Afrique|afropop|bamako|2010s|4|k|
Sons of Kemet|jazz|london|2010s|5|nk|
Jon Batiste|jazz,soul|new orleans|2010s|4|n|
Esperanza Spalding|jazz|portland|2000s|3|n|
Cécile McLorin Salvant|jazz vocal|miami|2010s|1|n|Cecile McLorin Salvant
`
  .trim()
  .split("\n")
  .map((line, i) => {
    const [name, genres, scenes, era, energy, pubs, alias] = line.split("|");
    return {
      id: i + 1,
      name,
      genres: genres.split(","),
      scenes: scenes.split(","),
      era,
      energy: Number(energy),
      publishers: [...pubs].map(
        (c) => ({ n: "npr", k: "kexp", c: "colors" })[c] as Publisher,
      ),
      aliases: alias ? [alias] : [],
    };
  });

// Similar artists: the five sharing the most genres, closest in energy breaking ties.
const artists = ARTISTS.map((a) => {
  const similar = ARTISTS.filter((b) => b.id !== a.id)
    .map((b) => ({
      id: b.id,
      shared: b.genres.filter((g) => a.genres.includes(g)).length,
      gap: Math.abs(b.energy - a.energy),
    }))
    .filter((b) => b.shared > 0)
    .sort((x, y) => y.shared - x.shared || x.gap - y.gap || x.id - y.id)
    .slice(0, 5)
    .map((b) => b.id);
  return {
    id: a.id,
    name: a.name,
    review_status: "accepted",
    aliases: a.aliases,
    profile: {
      genres: a.genres,
      scenes: a.scenes,
      era: a.era,
      energy: a.energy,
      similar_artist_ids: similar,
      source: "editor",
    },
  };
});

const SONG_A = [
  "Golden",
  "Slow",
  "Paper",
  "Blue",
  "Late",
  "Glass",
  "Honey",
  "Quiet",
  "Wild",
  "Low",
];
const SONG_B = [
  "Hour",
  "Motion",
  "Garden",
  "Light",
  "Water",
  "Season",
  "Fever",
  "Road",
  "Room",
  "Sun",
];

// Assign artists to series: every artist gets one performance first, then
// fill each series up to its count, at most two per artist per series.
const slots = seriesDefs.map((s, i) => ({
  seriesIndex: i,
  def: s,
  artistIds: [] as number[],
}));
const fits = (slot: (typeof slots)[number], artistId: number) =>
  ARTISTS[artistId - 1].publishers.includes(slot.def.publisher) &&
  slot.artistIds.filter((id) => id === artistId).length < 2;

for (const artist of ARTISTS) {
  const open = slots.filter(
    (s) => s.artistIds.length < s.def.count && fits(s, artist.id),
  );
  if (open.length === 0)
    throw new Error(`no series has room for ${artist.name}`);
  // Prefer the full-depth series so thin ones fill with returning artists.
  const full = open.filter((s) => s.def.launch_depth === "full");
  pick(full.length ? full : open).artistIds.push(artist.id);
}
for (const slot of slots) {
  while (slot.artistIds.length < slot.def.count) {
    const candidates = ARTISTS.filter((a) => fits(slot, a.id));
    if (candidates.length === 0)
      throw new Error(`not enough artists for ${slot.def.name}`);
    slot.artistIds.push(pick(candidates).id);
  }
}

const usedVideoIds = new Set<string>();
const performances = slots.flatMap((slot) =>
  slot.artistIds.map((artistId) => {
    const s = slot.def;
    const artist = ARTISTS[artistId - 1];
    const song = `${pick(SONG_A)} ${pick(SONG_B)}`;
    let title = s.title_rule
      .replace("{artist}", artist.name)
      .replace("{song}", song);
    let minutes = s.minutes[0] + random() * (s.minutes[1] - s.minutes[0]);

    // About one in twenty uploads is not a performance.
    let kind = "performance";
    const roll = random();
    if (roll < 0.02) {
      kind = "interview";
      title = `${artist.name} - Interview (${s.name})`;
      minutes = 4 + random() * 8;
    } else if (roll < 0.035) {
      kind = "trailer";
      title = `${title} (Trailer)`;
      minutes = 0.5 + random();
    } else if (roll < 0.05) {
      kind = "clip";
      title = `${artist.name} - ${song} (${s.name})`;
      minutes = 3 + random() * 2;
    }
    const review_status = random() < 0.05 ? "flagged" : "accepted";

    let video_id = randomId(11);
    while (usedVideoIds.has(video_id)) video_id = randomId(11);
    usedVideoIds.add(video_id);

    const year = int(s.years[0], s.years[1]);
    const published_at = new Date(
      Date.UTC(year, int(0, 11), int(1, 28), int(12, 20)),
    ).toISOString();

    return {
      artist_ids: [artistId],
      video_id,
      series_id: slot.seriesIndex + 1,
      eligible: kind === "performance" && review_status === "accepted",
      kind,
      review_status,
      last_verified_at: FETCHED_AT,
      yt: {
        title,
        duration_s: Math.round(minutes * 60),
        published_at,
        available: random() > 0.03,
        fetched_at: FETCHED_AT,
      },
    };
  }),
);

// A few shared bills, so performance_artist has more than one row per performance.
for (const p of performances.filter((p) => p.kind === "performance")) {
  if (random() >= 0.04) continue;
  const { publisher } = seriesDefs[p.series_id - 1];
  const guest = pick(
    ARTISTS.filter(
      (a) => a.id !== p.artist_ids[0] && a.publishers.includes(publisher),
    ),
  );
  p.artist_ids.push(guest.id);
  const [lead] = p.artist_ids;
  p.yt.title = p.yt.title.replace(
    ARTISTS[lead - 1].name,
    `${ARTISTS[lead - 1].name} & ${guest.name}`,
  );
}

const catalog = {
  publishers: publishers.map(({ id, name, channel_id, channel_url }) => ({
    id,
    name,
    channel_id,
    channel_url,
  })),
  series,
  artists,
  performances: performances.map((p, i) => ({ id: i + 1, ...p })),
};

writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `wrote ${catalog.performances.length} performances, ${artists.length} artists, ${series.length} series`,
);
