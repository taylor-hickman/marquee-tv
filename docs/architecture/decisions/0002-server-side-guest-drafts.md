# 0002. Guest drafts live on the server under a bearer guest token

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 4, 5.2, 5.4 (`guest`), 7.1, 7.3, 9.2, 12 row 2; PRD 7.6, 11, 13, 18.1; journeys J6, J7, J11

## Context

PRD 1.0 kept a guest's playlist in local storage. Three things push the other way:

- Every curator run needs the current draft on the server, and `curator_run`, `playlist_revision` and `handoff_event` all reference a draft.
- The paywall (J7) holds the brief through sign-in and payment, and the email sign-in link can open in a different browser. Only a server copy survives that.
- Reload, crash and second-tab recovery (PRD 13, J11) come for free when the server has the latest revision.

The product also promises no account before the first playlist and no tracking cookies.

## Decision

The server holds every draft, guests' included. When `POST /api/drafts` arrives with no guest token, the server creates a `guest` and issues a random 128-bit token (architecture 7.1, 9.1). The client keeps it in local storage and sends it as a request header, not a cookie. The server stores only the token's hash and compares in constant time. Local storage also holds a render cache of the current list.

When a guest signs in, the server moves their drafts to the user. The sign-in link carries a one-time claim code bound to the guest, not the guest token, so the claim works from another browser.

Unclaimed guest drafts are deleted 30 days after last activity. `curator_run` rows keep their brief and output IDs with the draft link removed, for evals.

## Consequences

- The guest token is a bearer secret: whoever holds it can edit that guest's drafts. It's scrubbed from logs and Sentry like a password.
- Clearing local storage yields a new guest and another free playlist. That's accepted: a free playlist costs cents, and per-IP rate limits stop farming. No fingerprinting.
- Postgres being down takes drafts down with it. The editor still shows the cached list, and Play on YouTube still works from it (architecture 9.5).
- A header instead of a cookie means server-rendered pages can't see the guest. Draft data loads client-side.
