// The ingestion worker's YouTube jobs (architecture 8):
//
//   pnpm ingest new [--series 1,2]       nightly: new uploads per series
//   pnpm ingest refresh [--series 1,2]   weekly: re-fetch every cache row
//   pnpm ingest expire                   nightly: delete rows past retention
//
// new and refresh need YOUTUBE_API_KEY; all three need DATABASE_URL.
// --series limits a run to those series ids. Each prints what it wrote and the
// quota units it spent.
import { parseArgs } from "node:util";
import { sql } from "@/lib/db";
import {
  createYouTube,
  expire,
  ingestNew,
  refresh,
} from "@/modules/catalog/youtube";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { series: { type: "string" } },
});
const job = positionals[0];
const seriesIds = values.series?.split(",").map(Number);
const now = new Date();

function youtube() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set");
  return createYouTube(key);
}

try {
  if (job === "new") {
    const client = youtube();
    const { written } = await ingestNew(client, now, seriesIds);
    console.log(`wrote ${written} performances, ${client.units} quota units`);
  } else if (job === "refresh") {
    const client = youtube();
    const r = await refresh(client, now, seriesIds);
    console.log(
      `checked ${r.checked}: ${r.available} available, ${r.gone} gone, ${r.restored} restored; ${client.units} quota units`,
    );
  } else if (job === "expire") {
    const { expired } = await expire(now);
    console.log(`expired ${expired} cache row${expired === 1 ? "" : "s"}`);
  } else {
    throw new Error("Usage: pnpm ingest new|refresh|expire [--series 1,2]");
  }
} finally {
  await sql.end();
}
