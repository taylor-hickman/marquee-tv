# YouTube compliance memo

Nov 8, 2026 · Phase 0 deliverable (PRD 12, build plan R2) · Status: agent's reading, not legal advice

This is an agent's reading of YouTube's published policies. No lawyer has reviewed it. The clauses listed under "For a lawyer to confirm" are the ones where a different reading would change the build. Treat every "yes" here as "yes on the plain text", and every "unclear" as a question to put to counsel before launch.

## Sources

All three pages were fetched on Nov 8, 2026. Neither policy page prints a date. The revision history's latest entry is June 1, 2026 (an update to the derived-metrics policy), so that is the version read.

| Short name | Document | URL |
| --- | --- | --- |
| ToS | YouTube API Services Terms of Service | https://developers.google.com/youtube/terms/api-services-terms-of-service |
| DP | YouTube API Services Developer Policies | https://developers.google.com/youtube/terms/developer-policies |
| Guide | Developer Policies guide (examples and FAQ) | https://developers.google.com/youtube/terms/developer-policies-guide |

Section numbers follow the policy's own cross-references (for example "III.E.4.c"). The Guide has no numbers, so it is cited by heading.

Two definitions decide most of what follows. DP IV: "Non-Authorized Data" means "API Data accessible by an API Client without User Credentials." "API Data" is "data, content (including audiovisual content) and information provided to API Clients … through the YouTube API services." Everything the ingestion worker fetches with an API key (video IDs, titles, durations, publish dates, status) is Non-Authorized Data.

## The three questions

### 1. Retention window for `performance_yt_cache`: 30 calendar days. Yes.

> "API Clients may temporarily store limited amounts of Non-Authorized Data for as long as is necessary for the purposes of the API Client but not longer than 30 calendar days. As in section (III.E.4.c) immediately above, this means that after 30 calendar days, the API Client must either delete or refresh the stored data." (DP III.E.4.d)

> "In all cases, API Clients must use reasonable efforts to ensure that their stored API Data is consistent with the current data available through YouTube API Services." (DP III.E.4.e)

The design already fits. The weekly `refresh` job re-fetches every cache row, so no row should reach 30 days, and the nightly `expire` job deletes any row whose `fetched_at` is older than 30 days. A2 should set the retention constant to 30 days, measured from `fetched_at`.

One consequence the architecture doesn't state: `performance.video_id` is API Data too. I found no exemption for video IDs or other identifiers anywhere in the ToS, DP or Guide. My reading is that the weekly `videos.list` call refreshes the ID along with the cache row, so keeping it long-term is fine while the video still exists. When a video stops coming back from `videos.list` (deleted or made private), the ID can't be refreshed, and after 30 days it should go. Today `expire` marks such performances ineligible and keeps the row. That is listed for a lawyer below; if counsel agrees with the strict reading, `expire` also deletes `performance` rows that have had no successful refresh in 30 days.

### 2. Model-generated artist profiles keyed by names parsed from API titles: unclear. Counts as yes for A4.

The profile content itself is fine. It is the model's general knowledge about a named musician (genres, scenes, era, energy, similar artists), and nothing in it is read from YouTube. The question is the key: the artist name comes from parsing a video title, which is API Data.

> "Your API Clients must not (i) replace API Data with similar, independently calculated data, or (ii) access or use API Data to create new or derived data or metrics." (DP III.E.4.h)

> "Don't use YouTube's API to offer independently calculated or derived metrics or data that replace or provide new data that isn't available via YouTube's API services." (Guide, "Only offer metrics that are available via YouTube's API services")

A strict reading of (ii) makes the `performance_artist` mapping derived data, since we produce it by reading API titles. If so, it would fall under the 30-day rule along with the title. A narrower reading, which the surrounding text supports, is that III.E.4.h is about metrics: every example in the clause and in the Guide section is a count, score, ratio or estimate. An artist's name is a public fact about who performed, the same fact the publisher prints in its own credits, and we never show it as if YouTube supplied it.

My reading is the narrow one, so profiles are acceptable. Two things make it safer:

- Editors confirm the artist link for every performance through the review queue (A5) before it is relied on long-term, so the mapping is editorial work and not a pure transformation of the title.
- The profile is keyed by our `artist.id`, never by a video, and contains nothing from the title beyond the name.

If counsel takes the strict reading, the fallback is the one architecture 14 names: request-time similarity lookups with a cache, at higher latency and cost.

### 3. The four-value `kind` column (performance, interview, trailer, clip): unclear, and the weakest of the three. Counts as yes for A3.

> "Infer or estimate the content category/type of a video or channel; you may only use the content type returned by the YouTube API." (Guide, "Only offer metrics that are available via YouTube's API services", listed under "Don't use YouTube's API to:")

This is the one sentence in the policies that reads as if written about us. Classifying a video as performance, interview, trailer or clip, from its title, is inferring its content type. Against it:

- The sentence sits in the Guide's metrics section, next to estimating watch time, CPM and audience demographics. Its target looks like analytics products that publish claims about videos.
- `kind` is never shown to users. It decides which videos the curator may pick and routes the review queue. Choosing which links to put in a playlist is the product, and the Guide's own allowed example ("A Search engine that lists YouTube videos alongside videos available on other platforms") involves the same kind of selection.

There is a cheap way to take most of the risk off the table, which I'd recommend before A3 is built: source each series from the publisher's own series playlist, where one exists, instead of the channel's full uploads playlist. A video's presence in a publisher's playlist of its sessions is the publisher's own classification, returned by the API, so `kind = performance` is no longer something we infer. Whether each publisher keeps a complete series playlist is unverified: the first page of NPR Music's and KEXP's public playlists on Nov 8, 2026 showed only partial ones ("10 Best Tiny Desk Concerts of 2024", "Live Sessions", festival and show playlists). A2 can settle it with one `playlists.list` call per channel. The title rule and the model call then only handle the exceptions (a trailer inside a session playlist), which is a much smaller amount of inference. `series.uploads_playlist_id` can hold the series playlist ID without a schema change. Recording this as a recommendation, not a decision, since it changes how A2 and A3 read the column.

The build plan's rule stands: unclear counts as yes, A3 builds four values now, and the question goes to counsel.

## The other checks PRD 12 asks for

| Design decision (PRD 12) | Clause | Reading |
| --- | --- | --- |
| Refresh API fields weekly, treat as cache | DP III.E.4.d, III.E.4.e (quoted above) | Yes. Weekly is inside 30 days |
| Thumbnails shown from `i.ytimg.com`, never stored | DP III.E.1.a: must not "download, import, backup, cache, or store copies of YouTube audiovisual content". Guide: "video metadata such as thumbnail and title must be visible to the viewer and unmodified. The video thumbnail must not be altered." | Yes, as long as titles and thumbnails are shown unmodified. Don't crop thumbnails in a way that alters them; scaling is fine |
| Attribution | DP III.F.2.a: "Any API Client page or feature that displays YouTube content – including, without limitation, search results, YouTube videos, channels, playlists, thumbnails, and YouTube players – must make clear to the viewer that YouTube is the source of the relevant content by displaying YouTube Brand Features in accordance with … the YouTube Branding Guidelines". ToS 10.3: "All API Clients must provide proper attribution in accordance with the YouTube Branding Guidelines" | Needs a change. The editor, browser and drawer show thumbnails and titles, so each needs visible YouTube attribution. PRD 12 only covers publisher logos ("no logos, no implied endorsement"). This adds a YouTube mark to E3 and E7, an exception to the no-helper-text rule that the design spec should place |
| No implied endorsement | ToS 13: "You must not make any public statements regarding your access to, or use of, the YouTube API Services that suggests partnership with, or sponsorship or endorsement by, YouTube without YouTube's prior review and written approval." | Yes. Marketing copy must not suggest a YouTube partnership |
| Paid access covers curation, not YouTube data or playback | DP III.G.1.b: must not "sell YouTube API Services or access to any components of YouTube API Services unless you obtain YouTube's prior written approval". DP III.F.3.a: "API Clients must not charge users to watch content in an embedded YouTube player." Guide: "You also cannot charge people a fee for services that are offered free of charge on YouTube." | Yes. The paywall gates model-backed runs (generate, refine, regenerate, fill). Play and copy stay free forever, and playback happens on YouTube. Keep pricing copy about the curator; never "unlock videos" or "unlock playback" |
| Links open in the YouTube app | Guide: "Links must open in the YouTube application whenever the application is available on a user's device, or if not installed, via the system web browser." | Yes. This is what the `watch_videos` handoff does on phones. It is also a reason to prefer a direct youtube.com link over a redirect if R1 shows the `302` losing the app handoff |
| Ingestion uses only the Data API | DP III.I: must not "use any technology other than YouTube API Services to access or retrieve API Data". DP III.D.1.c: "you must create exactly one (1) API Project for that API Client." | Yes, with a rule for the build: no RSS feeds, page scraping or third-party downloaders to fill the catalog, and one Google Cloud project for the app |
| Privacy policy and terms | DP III.A.1: API Clients "must display a link to YouTube's Terms of Service (https://www.youtube.com/t/terms), and they must also state in their own terms of use that, by using those API Clients, users are agreeing to be bound by the YouTube Terms of Service." DP III.A.2 requires the policy to "notify users that the API Client uses YouTube API Services" and "reference and link to the Google Privacy Policy" | Needs adding to D3's draft text. Both requirements apply in P0 because the app uses API Services even before any OAuth |
| Delete my data | DP III.E.4.g: "If the user indicates that you should delete that data, you must then delete it as soon as possible and within 7 calendar days." | Yes. `DELETE /api/account` is synchronous. The Guide says "within 30 days"; the 7-day DP figure is the stricter and is what we meet |

## Something the PRD doesn't ask about: is `watch_videos` an undocumented API?

> "You must not use undocumented APIs without express permission. You must access data from YouTube API services only according to the means stipulated in the authorized documentation of that YouTube API service." (DP III.D.7)

The handoff opens `https://www.youtube.com/watch_videos?video_ids=…` in the user's browser or YouTube app. My reading is that this is a link to a YouTube Application page, not use of an API: no API Data comes back to us, no key is involved, and the user's own client loads the page. The `check-handoff` job is closer to the line, because our server requests the URL to check that it redirects. It reads only the redirect location, not API Data. Still, it is the clause most likely to be raised in a quota audit, and the quota application (`quota-application.md`) describes the handoff plainly rather than leaving a reviewer to discover it.

## For a lawyer to confirm

1. DP III.E.4.h(ii) and the Guide's metrics section: does "create new or derived data" reach an artist mapping and a performance-or-not classification that are never shown as YouTube data? (Questions 2 and 3.)
2. Guide, "Infer or estimate the content category/type of a video": does it apply to an internal eligibility flag? Does sourcing from the publisher's own series playlists resolve it?
3. DP III.E.4.d: is a video ID kept on `performance` covered by the 30-day rule, and does a weekly successful `videos.list` call count as refreshing it?
4. DP III.D.7: is the `watch_videos` URL an "undocumented API", and does a server-side check of its redirect change that?
5. DP III.F.2.a and the Branding Guidelines: the exact attribution the editor and browser need. The Branding Guidelines page wasn't read for this memo.
6. DP III.E.2.a ("Do not aggregate API Data except that you may only aggregate API Data relating to YouTube channels that are under the same content owner"): the context is analytics, but a catalog spanning three publishers' channels is literally an aggregate across content owners.

## What changes in the build plan

- A2: retention constant is 30 days from `fetched_at`.
- A3 and A4: proceed as written (unclear counts as yes). Recommended before A3: series playlists instead of full uploads playlists.
- E3 and E7: YouTube attribution next to thumbnails and titles. Not in either card today.
- D3: terms link to YouTube's Terms of Service and say users agree to them; privacy policy says the app uses YouTube API Services and links Google's Privacy Policy.
- Pricing copy (E8): the price buys curation; never imply it unlocks videos.
