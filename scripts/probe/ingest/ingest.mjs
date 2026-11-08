// Phase 0 ingest of one publisher channel, end to end: uploads playlist → videos.list → title rules → rows.
// Uses only playlistItems.list, videos.list and one channels.list call (PRD 9.3; compliance memo, III.I).
//
// Usage: YOUTUBE_API_KEY=… node ingest.mjs [@handle]
//
// Writes rows shaped like architecture 5.1 to out/<timestamp>/ (gitignored: it holds API Data, which the
// compliance memo keeps out of git and deletes after 30 days) and an aggregate report with no titles to
// results/report.json.
import { mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { classify, SERIES } from './rules.mjs';

const KEY = process.env.YOUTUBE_API_KEY;
const HANDLE = process.argv[2] ?? '@nprmusic';
const RETENTION_DAYS = 30;
const API = 'https://www.googleapis.com/youtube/v3/';
if (!KEY) {
  console.error('Set YOUTUBE_API_KEY to a YouTube Data API v3 key.');
  process.exit(1);
}

let units = 0;
async function call(method, params) {
  units += 1; // channels.list, playlistItems.list and videos.list each cost 1 unit
  const res = await fetch(API + method + '?' + new URLSearchParams({ ...params, key: KEY }));
  const body = await res.json();
  if (!res.ok) throw new Error(`${method} ${res.status}: ${body.error?.message}`);
  return body;
}

const started = Date.now();
const fetchedAt = new Date().toISOString();
const outRoot = new URL('./out/', import.meta.url);
mkdirSync(outRoot, { recursive: true });
for (const dir of readdirSync(outRoot)) {
  const path = new URL(dir, outRoot);
  if (Date.now() - statSync(path).mtimeMs > RETENTION_DAYS * 86_400_000) rmSync(path, { recursive: true });
}

// 1. The channel's uploads playlist.
const channel = (await call('channels', { part: 'contentDetails', forHandle: HANDLE })).items?.[0];
if (!channel) throw new Error(`No channel for ${HANDLE}`);
const uploads = channel.contentDetails.relatedPlaylists.uploads;

// 2. Every video ID in it, 50 per page.
const listed = [];
let pageToken;
do {
  const page = await call('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: 50, ...(pageToken && { pageToken }) });
  listed.push(...page.items.map((i) => i.contentDetails.videoId));
  pageToken = page.nextPageToken;
} while (pageToken);
const ids = [...new Set(listed)];

// 3. Title, duration, date and status, 50 per call. Deleted and private videos don't come back.
const videos = [];
for (let i = 0; i < ids.length; i += 50) {
  const batch = await call('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: 50 });
  videos.push(...batch.items);
}

// 4 and 5. Classify, parse artists, derive eligibility; split editorial rows from API cache rows.
const performance = [];
const cache = [];
const tally = { kind: {}, reason: {}, reviewStatus: {} };
const bump = (group, key) => (tally[group][key] = (tally[group][key] ?? 0) + 1);
let outOfSeries = 0;
let eligibleSeconds = 0;

for (const v of videos) {
  const durationS = isoSeconds(v.contentDetails.duration);
  const c = classify(v.snippet.title, durationS);
  bump('reason', c.reason);
  if (!c.inSeries) {
    outOfSeries += 1;
    continue;
  }
  const available = isAvailable(v);
  const eligible = c.kind === 'performance' && c.reviewStatus === 'accepted';
  bump('kind', String(c.kind));
  bump('reviewStatus', c.reviewStatus);
  if (eligible && available) eligibleSeconds += durationS;
  performance.push({ video_id: v.id, series: SERIES, kind: c.kind, eligible, review_status: c.reviewStatus, artists: c.artists, last_verified_at: fetchedAt });
  cache.push({ video_id: v.id, title: v.snippet.title, duration_s: durationS, published_at: v.snippet.publishedAt, available, fetched_at: fetchedAt });
}

const runDir = new URL(fetchedAt.replace(/[:.]/g, '-') + '/', outRoot);
mkdirSync(runDir);
writeFileSync(new URL('performance.jsonl', runDir), performance.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(new URL('performance_yt_cache.jsonl', runDir), cache.map((r) => JSON.stringify(r)).join('\n') + '\n');

const usable = performance.filter((p, i) => p.eligible && cache[i].available);
const report = {
  ranAt: fetchedAt,
  channel: { handle: HANDLE, id: channel.id, uploadsPlaylist: uploads },
  quotaUnits: units,
  seconds: Math.round((Date.now() - started) / 1000),
  uploadsListed: ids.length,
  returnedByVideosList: videos.length,
  missingFromVideosList: ids.length - videos.length,
  outOfSeries,
  inSeries: performance.length,
  byKind: tally.kind,
  byReviewStatus: tally.reviewStatus,
  byRuleReason: tally.reason,
  unavailableInSeries: cache.filter((c) => !c.available).length,
  eligibleAndAvailable: usable.length,
  eligibleAndAvailableHours: Math.round(eligibleSeconds / 360) / 10,
  distinctArtists: new Set(usable.flatMap((p) => p.artists)).size,
};
writeFileSync(new URL('./results/report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

function isoSeconds(d) {
  const m = d?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) ?? [];
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0));
}

// Public, processed, and not blocked in the US (the launch market).
function isAvailable(v) {
  const r = v.contentDetails.regionRestriction;
  return v.status.privacyStatus === 'public' && v.status.uploadStatus === 'processed' && !r?.blocked?.includes('US') && (!r?.allowed || r.allowed.includes('US'));
}
