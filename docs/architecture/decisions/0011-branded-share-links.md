# 0011. Branded short links for Copy and Share; direct youtube.com URL for Play

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 5.2 (`share_link`), 7.2, 9.1 (`/api/drafts/:id/share-link`, `/s/:code`), 9.2, 9.5, 12 row 15, 14; PRD 7.5, 15, 18.1; journeys J5, J9

## Context

A bare `watch_videos` URL with 30 video IDs is long and anonymous. Shared in a group chat, it doesn't say where it came from, and we can't count opens, which PRD 15 uses as a proxy for second plays. A server redirect, though, is a known way to lose the universal-link handoff into the YouTube app on iOS, and Play on YouTube must open from the click handler with nothing awaited first.

## Decision

**Play on YouTube** opens the youtube.com `watch_videos` URL directly and synchronously in the click handler, then records the `handoff_event` with `navigator.sendBeacon`. It never goes through our redirect.

**Copy and Share** use a branded short link. The client asks `POST /api/drafts/:id/share-link` for a code, idempotent per draft, revision and start index, and copies `https://getmarquee.tv/s/<code>`. `GET /s/<code>` records `share_link_opened` and returns a `302` to the `watch_videos` URL for that revision. Copy uses the Clipboard API; Share uses the Web Share API where it exists.

If the Phase 0 device matrix (card R1) shows the `302` doesn't reach the YouTube app on both iOS and Android, `/s/<code>` serves a page with a tap-to-open button instead of redirecting.

## Consequences

- Shared links say where they came from, and opens are countable.
- A share link points at a fixed revision. Later edits don't change what a shared link plays.
- `/s/:code` gets a per-IP limit against scraping.
- If the redirect service is down, branded links fail but the YouTube URL in the handoff sheet still works. A share link is a convenience, never the only copy.
- Copy and Share await a server round trip for the code; Play doesn't. That's why only Play has the no-`await` rule.
