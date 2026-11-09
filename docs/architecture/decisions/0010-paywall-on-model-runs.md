# 0010. Entitlements gate model-backed runs, not drafts

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 2, 4 (free limit), 5.2 (`playlist_draft.free`, `status`), 6.3 (cost caps), 7.3, 9.1, 12 row 12; PRD 7.6, 13, 16, 18.1; journeys J4, J6, J7

## Context

The first AI-built playlist is free, and the second asks for a pass or a subscription. PRD 1.0 didn't say what "a playlist" meant for a set built by hand, or whether refinements inside the free playlist cost anything. Model calls are the only per-use cost; a hand-built draft costs a few Postgres rows.

## Decision

The paywall gates model-backed runs: generate, refine, regenerate and fill-the-rest. Draft creation, manual edits, replace, play and copy never need an entitlement.

A guest's or user's first draft to use the curator becomes their free draft (`playlist_draft.free = true`, at most one per owner). Model-backed runs on it are allowed up to the 25-run cap per draft. On any other draft, a model-backed run without an entitlement sets `status = awaiting_payment`, stores the brief on the draft, and returns `402`.

| Owner | May run the curator on a draft |
| --- | --- |
| Guest | Their free draft, within the 25-run cap. Any other draft: `402` |
| Pass holder | The pass's draft until `period_end`, then the draft is `read_only`. Their claimed free draft, always |
| Subscriber | Any of their drafts while the subscription is active. After cancellation, drafts become `read_only` but stay playable |

`read_only` blocks manual edits too. Play and copy only read a revision, so they always work.

## Consequences

- Hand-built sets never meet the paywall, and the returning-guest card lists every draft, free or hand-built.
- The check sits in one place per route (generate and refine), so the four model-backed actions can't drift apart.
- The 25-run cap is what makes "refinements inside a draft are free" safe to offer. Past it, manual edits and replace still work.
- The free limit is soft: a new guest token gets a new free draft. Per-IP rate limits bound the cost.
- CLAUDE.md calls draft creation, manual edits and replace "always allowed". `read_only` still blocks manual edits on a lapsed draft, so "always" holds for entitlements, not for `read_only`.
