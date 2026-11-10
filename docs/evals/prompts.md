# Eval prompts

PRD 14's 50-prompt set. `pnpm evals` parses this table and runs every row through `curator.generate` against the staging catalog. Code checks the invariants (architecture 6.5); raters judge each output against its **Expectation** (K3). An output passes when every clause of its expectation holds.

Expectations name energy with the product's five words, lowest to highest: **hushed, mellow, easy, upbeat, loud** (the energy 1 to 5 the brief echo uses).

| Column | Holds |
| --- | --- |
| Chip | The mood chip, or `—` |
| Length | The duration control: a preset (`30m`, `1h`, `2h`, `3h`) or a custom length |
| Seeds | Artist seeds, `;`-separated. A trailing `!` makes the seed must-include. A seed outside the catalog is influence only, as in the app |
| Pins | Tracks pinned before a second run. `@4` is a position pin on track 4; `+2` is an include pin on track 2. The runner generates, pins those tracks, then generates again with the same input |
| Types | The PRD 7.4 instruction types the prompt carries: energy, source, familiarity, structure, format |
| Prompt | The listener's words, sent as typed |

| # | Chip | Length | Seeds | Pins | Types | Prompt | Expectation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | dinner_party | 2h | — | — | energy | Warm and slow to start, a little livelier by dessert | Opens hushed or mellow; ends at easy or upbeat; every pick below loud |
| 2 | dinner_party | 1h | — | — | format | Stripped-down sets, nothing with a full band | Every pick is Tiny Desk or COLORS |
| 3 | dinner_party | 3h | Leon Bridges!; Thee Sacred Souls | — | energy | Soul and slow grooves | Leon Bridges appears; soul throughout; every pick mellow to easy |
| 4 | dinner_party | 90m | — | — | source | Only Tiny Desk | Every pick is a Tiny Desk or Tiny Desk Home concert |
| 5 | dinner_party | 2h | — | — | familiarity | Jazz-leaning, and artists people haven't heard of | Jazz and neo-soul throughout; at most two household names |
| 6 | dinner_party | 45m | — | @1 | structure | Keep it gentle, build a little at the end | Track 1 unchanged; the last third sits one step above the rest |
| 7 | dinner_party | 2h | — | — | — | Something my parents and my friends would both enjoy | Soul, Americana and indie; every pick easy or calmer |
| 8 | dinner_party | 1h | Natalia Lafourcade! | — | format | Latin folk, solo or small acoustic groups | Natalia Lafourcade appears; most picks are Latin folk in solo or small acoustic setups |
| 9 | friends_over | 2h | — | — | energy | Warm and slow to start, dancing by the end | Opens mellow; the last third is upbeat or loud |
| 10 | friends_over | 3h | Khruangbin!; Radiohead | — | — | Psych and funk, some guitar heroes | Khruangbin appears; psych and funk lead; Radiohead is absent (influence only) |
| 11 | friends_over | 1h | — | — | source | More KEXP, no Tiny Desk | Most picks are KEXP; every other pick is COLORS |
| 12 | friends_over | 2h | — | @1 @4 | energy | Funkier in the middle | Tracks 1 and 4 unchanged; the middle third leans funk |
| 13 | friends_over | 90m | — | — | familiarity | Indie rock but skip the obvious names | Indie rock throughout; at most two household names |
| 14 | friends_over | 2h | — | — | structure | Start with three mellow ones, then pick it up and keep it there | Tracks 1 to 3 mellow; every later pick upbeat |
| 15 | friends_over | 30m | — | — | — | A quick warm-up set before everyone heads out | About 30 minutes, easy to upbeat |
| 16 | friends_over | 2h | Anderson .Paak!; Vulfpeck! | — | format | Full band only, horns welcome | Both seeds appear; every pick is a full-band set |
| 17 | sunday_morning | 2h | — | — | energy | Soft and slow the whole way | Every pick hushed or mellow |
| 18 | sunday_morning | 1h | Adrianne Lenker!; Bon Iver! | — | — | Folk and coffee | Both seeds appear; quiet indie folk throughout |
| 19 | sunday_morning | 90m | — | — | source | Tiny Desk and COLORS, nothing from KEXP | Every pick is from an NPR Music or COLORS series |
| 20 | sunday_morning | 3h | — | — | familiarity | Gentle music from artists I probably don't know | Every pick mellow or calmer; at most two household names |
| 21 | sunday_morning | 2h | — | +1 | structure | Ease in for the first half hour, then a little brighter | The pinned pick is in the list; the first half hour is the calmest stretch |
| 22 | sunday_morning | 45m | — | — | format | Solo voice and guitar, minimal setups | Most picks are solo or duo sets from COLORS or Tiny Desk |
| 23 | sunday_morning | 2h | Nick Drake | — | — | Something in the spirit of Nick Drake | Hushed or mellow folk; Nick Drake is absent (influence only) |
| 24 | sunday_morning | 1h | — | — | energy | Mellow, maybe a bit of jazz | Every pick mellow or calmer; jazz present |
| 25 | after_hours | 2h | — | — | energy | Keep it low and moody, nothing that breaks the spell | Every pick hushed or mellow: r&b, dream pop, downtempo |
| 26 | after_hours | 3h | — | — | structure | Start upbeat, wind down for the last 30 minutes | Opens upbeat; the last 30 minutes are mellow or calmer |
| 27 | after_hours | 1h | Bonobo!; Floating Points | — | source | Electronic, KEXP sets welcome | Bonobo appears; electronic throughout; at least one KEXP set |
| 28 | after_hours | 90m | — | @2 @5 | — | Late-night r&b and neo-soul | Tracks 2 and 5 unchanged; r&b and neo-soul throughout |
| 29 | after_hours | 2h | — | — | familiarity | Deep cuts only, no headliners | At most two household names |
| 30 | after_hours | 90m | — | — | format | One voice and a beat, the COLORS kind of thing | Most picks are COLORS; the rest are one-voice setups |
| 31 | after_hours | 2h | Sade | — | energy | Smooth and slow like Sade | Every pick hushed or mellow soul and r&b; Sade is absent (influence only) |
| 32 | after_hours | 30m | — | — | source | No Live on KEXP, nothing loud | Every pick outside Live on KEXP and mellow or calmer |
| 33 | high_energy | 2h | — | — | energy | Loud from start to finish | Every pick upbeat or loud |
| 34 | high_energy | 1h | IDLES!; Turnstile! | — | format | Full band, the rawer the better | Both seeds appear; every pick is a full-band punk or post-punk set |
| 35 | high_energy | 3h | — | — | structure | Build for an hour, peak, then keep it there | Rises across the first hour; loud from then on |
| 36 | high_energy | 90m | — | @1 +3 | energy | Party set, afrobeats and dancehall | Track 1 unchanged and the include pick in the list; afrobeats and dancehall lead |
| 37 | high_energy | 2h | — | — | source | Only Live on KEXP | Every pick is Live on KEXP |
| 38 | high_energy | 45m | — | — | familiarity | Hip-hop, but surprise me with names I don't know | Hip-hop throughout; at most one household name |
| 39 | high_energy | 2h | Trombone Shorty!; Preservation Hall Jazz Band! | — | — | Brass and second-line energy | Both seeds appear; brass, funk and New Orleans jazz lead |
| 40 | high_energy | 1h | — | — | structure | Make the last 20 minutes the loudest | The loudest picks sit in the last 20 minutes |
| 41 | surprise_me | 2h | — | — | — | Surprise me | At least four genres and three series; energy moves in one clear arc |
| 42 | surprise_me | 1h | — | — | familiarity | Surprise me with artists I don't know | At least three genres; at most one household name |
| 43 | surprise_me | 3h | — | — | energy | Anything goes, but calm in the middle | At least four genres; the middle hour is the calmest stretch |
| 44 | surprise_me | 90m | Tinariwen! | — | source | Global sounds, any series | Tinariwen appears; desert blues, afropop and other global music lead |
| 45 | surprise_me | 2h | — | @1 @2 | — | Surprise me | Tracks 1 and 2 unchanged; at least three genres after them |
| 46 | — | 2h | — | — | structure | Keep the first five calm, then a steady groove | Tracks 1 to 5 mellow or calmer; every later pick easy or upbeat |
| 47 | — | 1h | Mdou Moctar!; Altin Gün!; Khruangbin | — | format | Guitar-led psych, full band only | Mdou Moctar and Altin Gün appear; every pick a full-band psych set |
| 48 | — | 4h | — | — | source | Mostly KEXP with some Tiny Desk | More than half KEXP; at least one Tiny Desk |
| 49 | — | 30m | — | — | energy | Short, sweet and calm | About 30 minutes; every pick mellow or calmer |
| 50 | — | 2h | — | @3 +5 | familiarity | Keep my picks, fill the rest with artists I don't know | Track 3 unchanged and the include pick in the list; at most two household names |
