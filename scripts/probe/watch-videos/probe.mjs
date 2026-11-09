// Answers architecture 14, third bullet: how does watch_videos respond to a non-browser client?
// Fetches one watch_videos URL with three known IDs via plain fetch (Node's default
// User-Agent, then a desktop Chrome one) and via Playwright's headless Chromium. Records
// status codes, the redirect chain and whether list= appears. Writes results/watch-videos.json.
// Usage: pnpm install && pnpm exec playwright install chromium && node scripts/probe/watch-videos/probe.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Three of the Tiny Desk IDs from ../handoff-page/index.html.
const IDS = ['QrR_gm6RqCo', 'ferZnZ0_rSM', '73wCQRQb7v0'];
const START = `https://www.youtube.com/watch_videos?video_ids=${IDS.join(',')}`;
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const hasList = (url) => new URL(url).searchParams.has('list');

// Follows redirects by hand so each hop's status and Location are recorded.
async function plainFetch(name, headers) {
  const chain = [];
  let url = START;
  for (let hop = 0; hop < 10; hop++) {
    const res = await fetch(url, { redirect: 'manual', headers });
    const location = res.headers.get('location');
    chain.push({ url, status: res.status, location });
    if (res.status < 300 || res.status >= 400 || !location) {
      const body = await res.text();
      return {
        client: name,
        chain,
        finalUrl: url,
        listInFinalUrl: hasList(url),
        listInAnyLocation: chain.some((h) => h.location && hasList(new URL(h.location, h.url).href)),
        bodyBytes: body.length,
        bodyMentionsList: /[?&]list=TL/.test(body),
      };
    }
    url = new URL(location, url).href;
  }
  return { client: name, chain, error: 'more than 10 redirects' };
}

async function browser() {
  const b = await chromium.launch();
  const context = await b.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const chain = [];
  page.on('response', (res) => {
    if (res.request().isNavigationRequest() && res.frame() === page.mainFrame())
      chain.push({ url: res.url(), status: res.status(), location: res.headers()['location'] ?? null });
  });
  const r = { client: `playwright chromium ${b.version()} headless` };
  try {
    await page.goto(START, { waitUntil: 'commit' });
    await page.waitForURL(/[?&]list=/, { timeout: 20_000 });
  } catch (e) {
    r.error = String(e).split('\n')[0];
  }
  Object.assign(r, { chain, finalUrl: page.url(), listInFinalUrl: hasList(page.url()) });
  await b.close();
  return r;
}

const results = [
  await plainFetch('fetch, default User-Agent', {}),
  await plainFetch('fetch, Chrome User-Agent', { 'user-agent': CHROME_UA, 'accept-language': 'en-US' }),
  await browser(),
];
for (const r of results) console.log(JSON.stringify(r));

const OUT = new URL('./results/', import.meta.url);
mkdirSync(OUT, { recursive: true });
writeFileSync(
  new URL('watch-videos.json', OUT),
  JSON.stringify({ ranAt: new Date().toISOString(), start: START, results }, null, 2) + '\n',
);
