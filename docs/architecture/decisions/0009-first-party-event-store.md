# 0009. Journey events live in our own Postgres

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 5.2 (`handoff_event`), 5.4 (`event`), 7.2, 9.1 (`POST /api/events`), 9.2, 9.3; PRD 13, 15; journeys 6

## Context

The PRD 15 metrics are funnels from landing to handoff to a second play, and payment conversion by pricing cohort. PRD 13 rules out tracking cookies and asks for first-party anonymous analytics only. Most of the events are already rows in our database (`curator_run`, `playlist_revision`, `handoff_event`), and the server knows about generation and payment directly.

## Decision

Journey events go into an `event` table in Postgres: name, guest or user, draft, `props` (jsonb), time. The server writes the events it knows about (generation, payment). The client writes the ones only it sees (landing, handoff) through `POST /api/events`, which accepts only the event names in journeys section 6 and has a per-IP limit. Handoffs are also recorded as `handoff_event` rows, sent with `navigator.sendBeacon` so a page that's leaving doesn't drop them.

PRD 15's funnels are SQL views over `event` and `curator_run`. A hosted, cookieless page-analytics tool covers traffic sources only.

## Consequences

- No third-party product analytics SDK, no cookies, and no event data leaving our database.
- Events join directly to drafts, revisions, curator runs and cohorts.
- Dashboards are SQL views, not a product analytics UI. That's enough for a beta cohort.
- The event table grows with traffic and will need a retention or rollup job at scale. Not a P0 concern.
- PRD 13 says "first-party anonymous analytics only" while architecture 9.3 adds the hosted page-analytics tool for traffic sources. This ADR follows the architecture doc. If the PRD's reading is meant strictly, the page-analytics tool goes.
