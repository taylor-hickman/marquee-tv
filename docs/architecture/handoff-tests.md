# Handoff tests

Phase 0 deliverable (PRD 7.5, 14; build plan R1; journeys J5, J9). Last run Nov 8, 2026.

The probe is `scripts/probe/handoff-page/`: a page with three controls and a server that answers `/r` with a `302`. The page uses five NPR Music Tiny Desk concerts (Mac Miller, Anderson .Paak, Jungle, Noah Kahan, Billy Strings).

| Control | What it does | Stands in for |
| --- | --- | --- |
| 1 · Play | `window.open` of `watch_videos?video_ids=<all five>`, synchronously in the click handler | Play on YouTube |
| 2 · Play from 3 | The same, with the list sliced from the third ID | Play from here (J9) |
| 3 · Play via 302 | A plain link to `/r`, which the server answers with `302 Location: <the URL from control 1>` | A `getmarquee.tv/s/<code>` share link (architecture 7.2) |

## Results

Pass means every check in the column held. Unverified rows give the exact steps to run.

| Surface | `watch_videos` opens and plays | Play from here starts at the chosen track | `302` lands in YouTube (the app, on a phone) |
| --- | --- | --- | --- |
| Desktop Chrome 156 | Pass | Pass | Pass (lands on the queue; desktop has no app) |
| Desktop WebKit 26 (Safari's engine) | Pass | Pass | Pass (lands on the queue) |
| Desktop Firefox 142 | Pass | Pass | Pass (lands on the queue) |
| iOS Safari, YouTube app installed | Unverified, steps A | Unverified, steps A | Unverified, steps A |
| Android Chrome, YouTube app installed | Unverified, steps B | Unverified, steps B | Unverified, steps B |
| Cast to TV | Unverified, steps C | Unverified, steps C | n/a: casting starts from the app the `302` lands in |
| Instagram in-app browser | Unverified, steps D | Unverified, steps D | Unverified, steps D |

The `302` column decides C3. The rule from the build plan: redirect only when iOS and Android both pass, and show the tap-to-open page otherwise, including when either is unverified. **Today C3 builds the tap-to-open page.**

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
