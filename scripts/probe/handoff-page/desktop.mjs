// Runs the three handoff probes in desktop Chrome, WebKit (Safari's engine) and Firefox,
// and writes one JSON result per browser and probe to results/desktop.json.
// Start server.mjs first. Usage: node desktop.mjs [baseUrl]
import { chromium, webkit, firefox } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const ids = [...readFileSync(new URL('./index.html', import.meta.url), 'utf8').matchAll(/\['([\w-]{11})',/g)].map((m) => m[1]);

const BROWSERS = [
  ['Chrome', chromium, { channel: 'chrome' }],
  ['WebKit', webkit, {}],
  ['Firefox', firefox, {}],
];
const PROBES = [
  { name: 'play', button: '#play', expectFirst: ids[0] },
  { name: 'from3', button: '#from3', expectFirst: ids[2] },
  { name: 'redirect', button: '#redirect', expectFirst: ids[0], sameTab: true },
];

async function probe(context, p, browserName) {
  const page = await context.newPage();
  await page.goto(BASE);
  let yt = page;
  if (p.sameTab) await page.click(p.button);
  else [yt] = await Promise.all([context.waitForEvent('page'), page.click(p.button)]);

  const r = { probe: p.name };
  try {
    await yt.waitForURL(/[?&]list=/, { timeout: 20_000 });
  } catch {
    r.error = 'no list= in URL within 20 s';
  }
  const url = new URL(yt.url());
  r.finalUrl = yt.url();
  r.list = url.searchParams.get('list');
  r.firstVideo = url.searchParams.get('v');
  r.firstVideoMatches = r.firstVideo === p.expectFirst;

  await yt.waitForSelector('ytd-playlist-panel-video-renderer', { timeout: 15_000 }).catch(() => {});
  r.queueIds = await yt
    .$$eval('ytd-playlist-panel-video-renderer a#wc-endpoint', (as) => [...new Set(as.map((a) => new URL(a.href).searchParams.get('v')))])
    .catch(() => []);
  r.queueMatches = JSON.stringify(r.queueIds) === JSON.stringify(ids.slice(ids.indexOf(p.expectFirst)));

  const currentTime = () => yt.evaluate(() => document.querySelector('video')?.currentTime ?? -1).catch(() => -1);
  r.autoplayed = await waitFor(async () => (await currentTime()) > 1, 15_000);
  if (!r.autoplayed) {
    await yt.click('.ytp-large-play-button, .ytp-play-button', { timeout: 5_000 }).catch(() => {});
    r.playsAfterOneClick = await waitFor(async () => (await currentTime()) > 1, 15_000);
  }
  r.playing = r.autoplayed || r.playsAfterOneClick === true;
  await yt.screenshot({ path: new URL(`${browserName}-${p.name}.png`, OUT).pathname }).catch(() => {});
  await page.close();
  if (yt !== page) await yt.close();
  return r;
}

async function waitFor(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

const results = [];
for (const [name, type, opts] of BROWSERS) {
  const browser = await type.launch({ headless: process.env.HEADED !== '1', ...opts });
  const context = await browser.newContext({ locale: 'en-US' });
  for (const p of PROBES) {
    const r = await probe(context, p, name).catch((e) => ({ probe: p.name, error: String(e).split('\n')[0] }));
    r.browser = name;
    r.version = browser.version();
    results.push(r);
    console.log(JSON.stringify(r));
  }
  await browser.close();
}
writeFileSync(new URL('desktop.json', OUT), JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, ids, results }, null, 2) + '\n');
