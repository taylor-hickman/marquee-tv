# 0003. Precomputed artist profiles and a two-call curator

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 2, 6.1, 6.2, 6.3, 8 (`profile` job), 11, 12 rows 1 and 8, 14; PRD 8, 12, 13, 18.1

## Context

PRD 1.0 described a tool-calling loop at request time: the model would search the catalog, look up artists and build the list over several round trips. Each round trip is another model call. Three or four of them don't fit in 8 seconds at p90 or in $0.05 per generation (PRD 13).

What the model adds is artist-level knowledge: genre, scene, era, typical energy, who sounds like whom (PRD 8.1). That knowledge doesn't change between requests.

## Decision

The ingestion worker asks the model once per artist and stores the answer in `artist_profile`: genres, scenes, era, energy from 1 to 5, and similar artists resolved to catalog IDs. Editors can override any row, and editor rows win.

A generation makes two model calls:

1. Brief extraction on a small model with structured output. It turns the prompt, chips, duration, seeds and current pins into a brief with an energy curve, genres, series constraints, novelty, exclusions and duration.
2. Composition on the main model with structured output. It orders up to 150 candidates that a SQL query over profiles retrieved, given as compact data rows with no titles or descriptions, and returns ordered IDs, a title and an arc line.

Code validates and repairs the result: it drops IDs outside the candidate set, restores pins, removes removed and excluded items, enforces the artist cap, and fixes duration.

Artists outside the catalog get no profile. For them, the brief step returns their genres, scenes and energy as part of the brief.

## Consequences

- Retrieval is SQL, so its latency and cost are predictable, and replace-one needs no model at all.
- The model never sees YouTube titles or descriptions at request time, which removes the main prompt-injection path (PRD 8.4).
- Profile quality caps playlist quality. The review queue and editor overrides are how it gets fixed.
- Profiles are keyed by artist names parsed from YouTube titles. PRD 12 treats a profile as the model's general knowledge about a named artist, and the Phase 0 compliance memo (card R2) must confirm that. If it doesn't, the fallback is request-time similarity lookups with a cache, at higher latency and cost.
- Provider and models for both calls are ADR 0008.
