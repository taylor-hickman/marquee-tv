# Handoff tests

Phase 0 deliverable (PRD 7.5, 14; build plan R1; journeys J5, J9). Desktop run Nov 8, 2026. Phone, TV and Instagram rows reported by Taylor Nov 9, 2026.

The probe is `scripts/probe/handoff-page/`: a page with three controls and a server that answers `/r` with a `302`. The page uses five NPR Music Tiny Desk concerts (Mac Miller, Anderson .Paak, Jungle, Noah Kahan, Billy Strings).

| Control | What it does | Stands in for |
| --- | --- | --- |
| 1 · Play | `window.open` of `watch_videos?video_ids=<all five>`, synchronously in the click handler | Play on YouTube |
| 2 · Play from 3 | The same, with the list sliced from the third ID | Play from here (J9) |
| 3 · Play via 302 | A plain link to `/r`, which the server answers with `302 Location: <the URL from control 1>` | A `getmarquee.tv/s/<code>` share link (architecture 7.2) |

## Results

Pass means every check in the column held. Taylor ran steps A to D below and reported "all work", with no notes per cell. Those cells say "user-reported, no detail": they don't record which app opened or how the queue looked.

| Surface | `watch_videos` opens and plays | Play from here starts at the chosen track | `302` lands in YouTube (the app, on a phone) |
| --- | --- | --- | --- |
| Desktop Chrome 156 | Pass | Pass | Pass (lands on the queue; desktop has no app) |
| Desktop WebKit 26 (Safari's engine) | Pass | Pass | Pass (lands on the queue) |
| Desktop Firefox 142 | Pass | Pass | Pass (lands on the queue) |
| iOS Safari, YouTube app installed | Pass (user-reported, no detail) | Pass (user-reported, no detail) | Pass (user-reported, no detail) |
| Android Chrome, YouTube app installed | Pass (user-reported, no detail) | Pass (user-reported, no detail) | Pass (user-reported, no detail) |
| Cast to TV | Pass (user-reported, no detail) | Pass (user-reported, no detail), including replacing the TV's queue mid-cast | n/a: casting starts from the app the `302` lands in |
| Instagram in-app browser | Pass (user-reported, no detail) | Pass (user-reported, no detail) | Pass (user-reported, no detail) |

The `302` column decides C3. The rule from the build plan: redirect only when iOS and Android both pass, and show the tap-to-open page otherwise, including when either is unverified. Both pass, so **C3 builds the `302` redirect.**

Not confirmed run: step A5 (Safari with the YouTube app deleted, J5's fallback) and step C3 (cast from desktop Chrome). Both are optional, and neither changes C3.

### Desktop: what was checked

`node desktop.mjs` drives Playwright with installed Google Chrome, Playwright's WebKit and Firefox, in fresh profiles with the `en-US` locale, and writes `results/desktop.json`. For each browser and control it checks that:

1. the YouTube tab reaches a URL with a `list=` parameter within 20 s. Every run got a temporary playlist, `list=TLGG…`;
2. `v=` in that URL is the expected first video: track 1 for controls 1 and 3, track 3 for control 2;
3. the queue panel lists exactly the expected IDs in order: five for controls 1 and 3, the last three for control 2. YouTube titles the queue "Untitled List · Unlisted";
4. the page's `<video>` element advances past 1 s without a click.

All four checks passed for all nine browser and control pairs, on two consecutive runs. Notes:

- Check 4 passed on a pre-roll ad in some runs. "Plays" means the YouTube player started, which may be an ad before the first performance. Viewers without YouTube Premium will see ads between tracks. The app may not block or skip them (Developer Policies; see `compliance-memo.md`).
- Playwright's WebKit is Safari's engine, not Safari. Real desktop Safari is expected to match but wasn't run.
- On desktop, "lands in the YouTube app" can only mean "lands on the same queue", since there is no app. The real question for this column is on phones.
- Fresh profiles have no YouTube history, which makes autoplay harder, not easier, so a real profile should do at least as well.

## How to run the phone and TV rows

Start the probe on a Mac on the same Wi-Fi as the phone:

```sh
cd scripts/probe/handoff-page
pnpm install
pnpm serve
```

It prints two URLs. Use the second (`http://192.168.x.x:8787/`) on the phone. The `302` test is closer to production when the link comes from outside the browser, so for each phone also send yourself the `/r` URL (shown at the bottom of the page) in Messages or WhatsApp and tap it there.

Write each cell as pass or fail, with a one-line note on what happened (which app opened, which track played, whether the queue showed all five).

**Steps A, iOS Safari (YouTube app installed, signed in or not).**
1. Open the page in Safari. Tap **1 · Play**. Pass if the YouTube app opens with Mac Miller playing and a queue of five. Fail if the queue opens in Safari or the app opens on a single video with no queue.
2. Back in Safari, tap **2 · Play from 3**. Pass if the app shows Jungle first with a queue of three.
3. Tap **3 · Play via 302**. Pass if the YouTube app opens with the five-video queue. If it loads m.youtube.com inside Safari instead, that is a fail for this column.
4. Tap the `/r` link from Messages. Record separately: does it open the app?
5. Delete or offload the YouTube app and repeat step 1. Record what Safari does (J5 expects m.youtube.com in Safari). Reinstall afterwards.

**Steps B, Android Chrome (YouTube app installed).** The same as steps 1 to 4 of A, in Chrome. If Android asks which app to open with, choose YouTube and note that the prompt appeared.

**Steps C, cast to TV.** On the TV: a Chromecast, or a smart TV with the YouTube app, on the same Wi-Fi.
1. From step A1 or B1, with the queue playing in the YouTube app, tap the cast icon and pick the TV. Pass if the TV plays Mac Miller and the next track follows on its own when it ends. Skip ahead in the app to save time.
2. While the TV plays, go back to the browser and tap **2 · Play from 3**. Pass if the YouTube app replaces the TV's queue with the three-video queue starting at Jungle, the "mid-party" case in J9. Record what happens if it doesn't: does the app ask before replacing, play the new queue on the phone instead, or add to the TV queue?
3. Desktop Chrome: open the queue with control 1, then Chrome menu → Cast → the TV. Record whether the whole queue or only the current video reaches the TV.

**Steps D, Instagram in-app browser.**
1. In Instagram, DM yourself the page URL and tap it, so it opens in Instagram's browser.
2. Tap **1 · Play**, **2 · Play from 3** and **3 · Play via 302** in turn. For each, record whether the YouTube app opens or YouTube loads inside Instagram, and whether the queue is intact.
3. If YouTube loads inside Instagram, use the ⋯ menu → "Open in external browser" and record whether that hands off to the app (the hint J5 proposes).

## Non-browser response

Build plan A0; answers architecture 14, third bullet, for `check-handoff` (architecture 8, card A6). Run Nov 9, 2026 from a US residential connection, twice, with the same result both times.

The probe is `scripts/probe/watch-videos/probe.mjs`. It requests `https://www.youtube.com/watch_videos?video_ids=QrR_gm6RqCo,ferZnZ0_rSM,73wCQRQb7v0` (the first three Tiny Desk IDs above) three ways, follows redirects one hop at a time, and writes `results/watch-videos.json`.

| Client | First response | `Location` | Final URL has `list=` |
| --- | --- | --- | --- |
| Node 24 `fetch`, default User-Agent, no cookies | `303` | `/watch?v=QrR_gm6RqCo&list=TLGG…` | Yes, `200` |
| Node 24 `fetch`, desktop Chrome User-Agent | `303` | the same | Yes, `200` |
| Playwright headless Chromium 158 | `303` | the same | Yes, `200` |

All three got one redirect, no consent or sign-in page, and the same playlist ID. `v=` is the first ID passed. The `TLGG…` ID repeated across runs on the same day, and the part after `TLGG` decodes from base64 to 8 opaque bytes followed by the date, `09112026`, so it's a temporary list built from the IDs and the day, not a saved one.

**Plain `fetch` is enough for `check-handoff`. Playwright isn't needed.** The check doesn't need to follow the redirect or download the watch page (about 1.4 MB): request the URL with `redirect: 'manual'`, then pass only if the status is `3xx` and `Location` has a `list=` parameter. Anything else fails, including a `200`, a redirect to `consent.youtube.com` or `accounts.google.com`, or a `Location` without `list=`.

Not tested: a request from a GitHub Actions runner. YouTube treats datacenter IPs more strictly than home connections, and this run can't show whether that reaches `watch_videos`. A6's first `workflow_dispatch` run settles it. If the runner gets a consent or bot-check page instead of the `303`, the check fails rather than passing falsely, and A6 should move to Playwright using `probe.mjs` as the starting point.
