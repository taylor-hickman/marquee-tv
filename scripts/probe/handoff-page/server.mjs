// Serves the handoff probe page and a 302 to the same watch_videos URL the page's first button opens.
// Listens on every interface so a phone on the same Wi-Fi can open it.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT ?? 8787);
const page = readFileSync(new URL('./index.html', import.meta.url));
const ids = [...page.toString().matchAll(/\['([\w-]{11})',/g)].map((m) => m[1]);
const target = 'https://www.youtube.com/watch_videos?video_ids=' + ids.join(',');

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  console.log(new Date().toISOString(), req.method, path, req.headers['user-agent']);
  if (path === '/r') {
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' }).end();
  } else if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
  } else {
    res.writeHead(404).end();
  }
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal);
  console.log(`http://localhost:${PORT}/`);
  if (lan) console.log(`http://${lan.address}:${PORT}/  (phones on this Wi-Fi)`);
});
