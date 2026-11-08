# 0001. Export through the `watch_videos` URL

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 2, 7.2, 8 (`check-handoff`), 9.5, 11; PRD 4.2, 7.5, 10.1, 10.2, 17; journeys J5, J9, J16

## Context

The product hands an ordered playlist to YouTube to play. There are two ways to do that. The YouTube Data API can create a real playlist in the person's account, but it needs Google OAuth with the `youtube` scope, a quota extension Google may grant slowly or not at all, and a write per item. A `https://www.youtube.com/watch_videos?video_ids=<ids>` URL opens the same videos as a ready queue with no key, no sign-in and no quota, but it's undocumented and YouTube could retire it.

PRD 4.2 rules out any external dependency on the critical path at launch, and the 60-second first-playlist target leaves no room for an OAuth consent screen.

## Decision

P0 exports through the `watch_videos` URL, built in the client from the current revision's video IDs in parts of at most 50. "Play from here" slices the list before splitting.

A runtime flag, `app_flag.handoff_mode`, selects the export path: `url` (the default), `copy_list` (the fallback if `watch_videos` stops working, J16), and later `api` for P1's Save to my YouTube. The client reads the flag with the draft, so switching needs no deploy.

A daily `check-handoff` job fetches a `watch_videos` URL with three known IDs and alerts if it stops redirecting to a URL with a `list=` parameter.

## Consequences

- No YouTube API call, OAuth or quota sits in the request path. The API is used only by the ingestion worker.
- Lists over 50 videos hand off in parts.
- If YouTube retires the URL, on-call flips `handoff_mode` to `copy_list` and users copy a plain list of links until the API path ships. The daily check is what tells us.
- A queue opened this way isn't saved in the person's YouTube account. The handoff sheet explains how to save it.
- P1 adds `youtube_connection` and `export_job` behind the same flag (architecture 11). Nothing in P0 has to change for it.
