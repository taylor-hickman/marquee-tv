# Ingest run: NPR Music

Phase 0 deliverable (PRD 9.3, 14). Run Nov 9, 2026.

The code is `scripts/probe/ingest/`, and the run's numbers are in `scripts/probe/ingest/results/report.json`. It ran this command:

```sh
node --env-file=.env scripts/probe/ingest/ingest.mjs   # @nprmusic by default
```

The rows themselves, `performance.jsonl` and `performance_yt_cache.jsonl`, are API Data. They stay in the gitignored `out/` folder, and the script deletes them after 30 days (`compliance-memo.md`). This page gives counts and series names, not video titles.

## Result

| | |
| --- | --- |
| Channel | @nprmusic, `UC4eYXhJI4-7wSWc8UNRwD4A` |
| Quota | 125 units: 1 `channels.list`, 62 `playlistItems.list`, 62 `videos.list` |
| Time | 23 s |
| Uploads listed | 3,059. `videos.list` returned all of them |
| Outside the series | 1,161: 1,064 never name Tiny Desk, 97 belong to another Tiny Desk series (mostly the Contest) |
| In the series | 1,898 |
| Kind | 1,784 performance, 1 clip, 1 interview, 112 with no kind |
| Review status | 1,769 accepted, 129 flagged |
| Not available in the US | 3 (all performances) |
| **Eligible and available** | **1,764 performances, 496.5 hours, 1,653 distinct artist strings** |

A full backfill of the largest publisher costs 125 units, 1.25% of the default daily quota. That's in line with the quota application's estimate.

## How good the rules were

I read the rows locally and spent another 125 units on a second pass to look at what the rules left out.

**Precision is high.** Every row in a random sample of 30 accepted performances was a real Tiny Desk concert with the right artist. So were all 12 accepted performances under 8 minutes (the shortest is 3.5 minutes). No accepted performance runs over 40 minutes.

**Nothing is missed outside the series.** None of the 289 uploads of 8 minutes or more that never name Tiny Desk is a Tiny Desk concert. They're NPR's other shows: Amplify with Lara Downes, Louder Than A Riot, Alt.Latino conversations, AmericanaFest streams, Field Recordings and anniversary concerts.

**The misses are inside the series.** Of the 112 rows with no kind, 56 run 8 minutes or more:

| Group | Count | Examples of the title shape |
| --- | --- | --- |
| A desk concert in a title the rule didn't expect | 13 | `<artist>: NPR Tiny Desk Concert` (no "Music"), `<artist> NPR Music Tiny Desk Concert` (no colon), `Holiday Tiny Desk Concert`, `Tiny Desk (Home) Concert: <artist>`, `From The Archives` |
| One act at a partner festival | 28 | `Tiny Desk Meets SXSW: <artist>`, `Tiny Desk Meets AFROPUNK: <artist>`, `<artist>: Tiny Desk x globalFEST` |
| Several acts in one video | 11 | `Tiny Desk Meets globalFEST: <artist>, <artist>, <artist>`, 45 to 70 minutes |
| Other | 4 | Tiny Desk Brasil, Tiny Desk Family Hour (2), a Tiny Desk Talks panel |

The other 56 run under 8 minutes. 43 of them are promos, merch and giveaway posts under 3 minutes. The other 13 run 3 to 8 minutes: six short Tiny Desk Family Hour sets, single songs, and behind-the-scenes videos about recording at the desk. None is a full concert.

On top of those, two Contest-winner concerts (`<artist>, <year> Tiny Desk Contest Winner: Tiny Desk Concert`) fall into "another Tiny Desk series", because the Contest exclusion matches first.

The 17 rows flagged for possible multiple artists are mostly real collaborations (`feat.`, `with`). `I'm With Her` is a band, so it's a false flag. `Carrtoons, Kaelin Ellis, Kiefer and The Kount` was accepted as one artist string, because the rule doesn't treat commas or "and" as separators.

## What this means for A2 and A3

- The 13 desk concerts and 2 Contest winners are rule gaps. A3 should widen the title rule or let its model pass pick them up. They're about 1% of the series.
- Whether the 28 festival sets count as Tiny Desk Concerts was a product question, not a parsing one. PRD 9.1 has since ruled them out, and the 11 videos with several acts each with them. A2's ingest already leaves both out: their titles don't carry "Tiny Desk Concert", so no series takes them.
- Artist strings are raw. 1,653 distinct strings for 1,764 performances means repeat artists are rare at NPR, but A4's profiles still need to split collaborations and merge spellings.
- The cache row's `available` flag works: 3 performances are blocked in the US. A2's `refresh` should keep that check.
