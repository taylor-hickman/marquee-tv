# Marquee TV — Product Requirements Document

Nov 8, 2026 · @Taylor Hickman · Version 1.1 · Status: Specification, decisions from journeys and architecture review folded in · Platform: Responsive Web

**Changes in 1.1.** Decisions forced by the user journeys and architecture docs are recorded in section 18 and applied throughout: guest drafts live on the server, the paywall gates model-backed runs rather than drafts, manual picks are pinned for inclusion, "Play from here" and branded share links join P0, the curator uses precomputed artist profiles and two model calls, and the stale "no accounts in P0" language is gone. Annual billing is deferred.

## 1. Summary

Marquee TV is an AI music curator for live-session videos. A user says what they are in the mood for, names an artist or two, or picks a duration, and the app assembles an ordered playlist of real performances from channels like NPR Tiny Desk, KEXP and COLORS, then hands it to YouTube to play on any screen, including the TV.

The product does three things YouTube does not: it works across publishers, it builds a session with an energy arc over a fixed duration, and it lets the user steer the result in plain language. It does not play video, host video or compete with YouTube; YouTube is the playback destination.

**Key design decisions.** The MVP ships without the YouTube Data API on the critical path: playlists are handed to YouTube through a URL that opens them as a queue the user can save with one tap, so launch needs no YouTube OAuth scope, no Google verification review and no API quota. (Sign-in for paying users uses Google's basic profile scope or an email link, neither of which needs review.) The AI reasons at the artist and publisher level rather than depending on hand-tagged performances, the catalog goes deep on three publishers before going wide, social hosts are the first audience, and the first playlist is free with paid access after it.

|  |  |
| --- | --- |
| One-line positioning | An AI music curator for the world's best live sessions |
| Beachhead user | Someone hosting friends who wants two hours of great live music on the TV in under a minute |
| MVP export | URL handoff to YouTube (no API, no login) |
| MVP catalog | Tiny Desk, KEXP, COLORS at full depth; others thin |
| North star | Playlists exported and played a second time |
| Business model | First playlist free; then $2.99 session pass or $4.99/month |
| Domain | getmarquee.tv |
| Instagram | @marquee.tv |

## 2. Problem and opportunity

Thousands of excellent live performances sit on YouTube, split across a dozen publishers, and nothing stitches them together into a listening session. YouTube's own tools work against this use: autoplay optimizes for the next click, not for a two-hour arc; search is per-video; playlists are built one video at a time; and recommendations ignore the publisher, so a Tiny Desk set leads to a lyric video.

The person who feels this most sharply is not the music obsessive. It is the host with friends arriving in twenty minutes who wants the TV to play something good, in the right order, for the whole party, without touching it again.

The opportunity is a thin layer on top of YouTube that owns the one step YouTube skips: deciding what to play and in what order. YouTube keeps playback, accounts, casting and devices. Marquee TV keeps taste.

## 3. Who it's for

**Beachhead: the social host.** They put music videos on the TV while entertaining. They have a mood and a rough duration in mind, not a list of artists. They want to be done in one minute and not think about it again. They are the clearest pain, the clearest prompt ("dinner party, two hours, starts mellow") and the clearest proof that the arc matters. Marketing, onboarding and the default entry point are built for them.

**Second: the live-session enthusiast.** They already watch Tiny Desk and KEXP, know what they like, and want to find more of it across publishers. They will use artist seeds, dig into the editor and tolerate more controls. They arrive on their own once the product exists; they are not the launch target.

**Later: the explorer.** They want to be surprised and to understand why. Served by the P1 "why this" explanations and discovery controls.

| Audience | Primary entry point | Key need | Tolerance for controls |
| --- | --- | --- | --- |
| Social host | Mood + duration | Good result fast, plays on TV | Low |
| Enthusiast | Artist seed | Cross-publisher discovery | High |
| Explorer | Surprise me | Novelty with a rationale | Medium |

## 4. Product principles

1. **Curate, don't play.** YouTube owns playback, devices and accounts. We never host, embed for primary playback, or rebuild what YouTube does well.
2. **No external dependency on the critical path at launch.** Anything a user must do to get value works without an API key, OAuth or a quota. Those become conveniences later.
3. **The arc is the product.** A playlist with a deliberate energy progression over a fixed duration is what autoplay cannot do. Every creation path produces one.
4. **AI reasons about what it knows.** Artists, genres, publisher conventions, musical relationships. It does not guess at performance-level details it has not been given; those are earned by the catalog over time.
5. **Verified catalog only.** The AI selects from real video IDs we have checked. It never invents a performance.
6. **The user always wins.** Pins, removals and explicit instructions are never overridden by a regeneration.
7. **Depth before breadth.** Full coverage of a few publishers beats thin coverage of many; dead-end requests kill trust faster than a short publisher list.
8. **One editor.** Mood, artist and manual paths all land in the same playlist editor, so there is one thing to learn.

## 5. Core user journey

The target for the beachhead user is **under 60 seconds from landing to music playing on the TV**, with no account.

1. **Land.** One prompt box and a few mood chips above it. "Tell us the vibe" is the default; "Start with an artist" and "Build it yourself" sit beneath as secondary links.
2. **Describe.** The user types or taps: "friends over for dinner, two hours, mellow then groovy." A duration control sits beside the prompt; if the text names a duration, the text wins and the brief echo shows which was used. (Publisher filtering is by natural language in P0; a filter UI is P1.)
3. **Generate.** The AI curator returns an ordered playlist in a few seconds, with a title, total runtime and a one-line description of the arc.
4. **Glance and adjust.** The editor shows the list with thumbnails, artist, publisher and duration. The user can remove, pin, reorder or type a correction ("less acoustic", "more KEXP"). Most users skip this step.
5. **Play on YouTube.** One button opens the playlist in YouTube (app on phone, site on desktop) as a ready queue. The first time in a browser, a short sheet appears first with two tips (how to save the queue, how to cast); after that the button goes straight to YouTube and the sheet stays reachable. On phone, the user casts to the TV from the YouTube app. YouTube offers "Save playlist" natively if they want to keep it.
6. **Come back.** The first playlist stays available in that browser and can be played again or edited for free. Asking the AI for a second playlist asks for an account and a session pass or subscription; paying users get a library of saved playlists.

The enthusiast path is the same journey entered at step 2 with an artist seed and a longer stay in step 4. The manual path enters at a performance browser and lands in the same editor.

## 6. MVP scope

P0 is deliberately small: everything the beachhead user needs to go from landing to music on the TV, plus accounts and payment for the second playlist. Genre as a standalone entry point, discovery-intensity modes, publisher multi-select UI and API-based export are P1 or later.

| Priority | Scope | Rationale |
| --- | --- | --- |
| **P0 — must ship** | Mood/natural-language entry point with duration | The beachhead's path |
| P0 | Artist-seed entry point | The enthusiast's path; cheap once the curator exists |
| P0 | Manual browse-and-add | Guarantees the editor is useful even when the AI misses |
| P0 | AI curator: intent → ordered playlist with an energy arc | The core value |
| P0 | Playlist editor: remove, pin, reorder, replace, regenerate unpinned | User control |
| P0 | Conversational refinement with undo | The "AI-native" differentiator |
| P0 | URL handoff to YouTube + copyable link | Zero-dependency export |
| P0 | "Play from here": hand off from any track, not only the first | A host who changes the set mid-party must not restart the queue |
| P0 | Branded share link (getmarquee.tv URL that redirects to YouTube) | Shared sets otherwise carry no trace of Marquee |
| P0 | Verified catalog with artist, publisher, series, duration | The AI's only source of truth |
| P0 | Guest mode for the first playlist; drafts held on the server under an anonymous token | No friction; survives reload and the sign-in flow |
| P0 | Basic analytics and error monitoring | Needed to learn anything from beta |
| P0 | Accounts and payments: first AI playlist free, then session pass or subscription | Self-sustaining from launch (section 16) |
| P0 | Saved playlists (library) | Paying users need a library from day one |
| P0 | Account screen: plan, cancel, update card, delete my data; privacy policy and terms | Required by Google sign-in and Stripe before the first account exists |
| **P1 — early follow-on** | Google sign-in + API export ("Save to my YouTube") | After quota extension is approved |
| P1 | "Why this performance" explanations | Explorer audience |
| P1 | Publisher filter and weighting UI | Enthusiast request; adds UI complexity |
| P1 | In-app preview player (YouTube IFrame embed) | Documented, free, lets users audition before export |
| P1 | Genre entry point and exclusions | Mostly covered by natural language |
| P1 | Feedback buttons ("too slow", "too loud") that write back to catalog tags | Turns users into taggers |
| **P2 — later** | Collaborative sessions, shareable public playlists | Growth |
| P2 | New-performance alerts for followed artists | Retention |
| P2 | Publisher partnerships, artist submissions | Catalog |

## 7. Functional requirements (P0)

### 7.1 Landing and entry

- A single natural-language prompt is the primary control. Six mood chips (Dinner Party, Friends Over, Sunday Morning, After Hours, High Energy, Surprise Me) prefill it.
- Duration selector: 30 min, 1 h, 2 h, 3 h, or custom. Default 2 h.
- "Start with an artist" and "Build it yourself" are visible secondary entry points.
- No account, cookie wall or email capture before the first playlist.
- Copy never assumes a time of day. People host brunches, afternoon barbecues and late nights, so the product says "set" or "party", not "tonight" or "evening". The session pass is defined by what it includes (16.1), not by a clock.
- A first-time user reaches a generated playlist in two interactions (type, submit).

### 7.2 Artist-seed entry

- Typeahead over artists in the catalog; also accepts artists not in the catalog as influence only.
- One or more seeds. Toggle: "must include these artists' performances" (default on when the artist is in the catalog).
- When a seed has no eligible performance, the app says so and offers the closest artists that do. It never pretends.

### 7.3 Manual browse

- Browse by publisher, series, artist; search by title and artist.
- Performance cards: thumbnail, artist, title, publisher, series, duration, upload year.
- Add to playlist from the card; running total duration visible in a drawer.
- Switch to "let AI fill the rest" at any point without losing picks (picks become pins).

### 7.4 Playlist editor

- Ordered list with thumbnail, artist, performance title, publisher, duration; total runtime vs target.
- Remove, pin, drag-to-reorder (with keyboard alternative), replace one (three alternatives matched on energy and length from the catalog; no model call), regenerate everything unpinned.
- Editable title and description.
- Conversational input anchored to the editor. Accepted instruction types: energy ("funkier", "calmer in the middle"), source ("more KEXP", "no Live Lounge"), familiarity ("more artists I don't know": prefer artists who are not seeds and were not kept in earlier revisions of this draft), structure ("keep the first five", "make the last 30 minutes upbeat"), format ("full band only", served through publisher and series conventions).
- Every AI change is a diff the user can see and undo in one step. Pins and removals survive any regeneration.
- Pins are position-locked when the user placed them; picks from the performance browser are pinned for inclusion only, and the curator may place them until the user moves one by hand.
- An explicit instruction beats an earlier pin: "drop Khruangbin" removes a pinned Khruangbin, and the diff says "Unpinned and removed" so it is visible and undoable.
- Playlist state lives in the app, not in the chat transcript.

### 7.5 Export (URL handoff)

- "Play on YouTube" builds `https://www.youtube.com/watch_videos?video_ids=<id1>,<id2>,…` from the ordered list and opens it in a new tab (desktop) or lets the YouTube app claim the link (mobile). The URL is opened synchronously from the click handler so browsers do not block it.
- "Play from here" builds the same URL from a chosen track onward, so a set changed mid-party resumes where the room is rather than from track one.
- Cap at 50 videos per handoff; longer playlists are split with a clear "Part 1 / Part 2" label.
- "Copy link" and "Share" use a short getmarquee.tv link that redirects to the YouTube URL for that revision, so a shared set carries the brand and opens are measurable. "Share" uses the Web Share API where available.
- A handoff sheet with two tips (how to save the queue as a playlist in YouTube, how to cast to a TV) appears on the first handoff in a browser; afterwards the button opens YouTube directly and the sheet stays reachable.
- Export success is measured client-side (link opened/copied); the app does not call the YouTube API.
- If YouTube ever retires the URL format, a runtime flag turns the button into "Copy video list" (plus the P1 API export when it exists). Monitor with a daily automated check.

### 7.6 Guest session

- Drafts, including guests' drafts, live on the server. On first use the server issues an anonymous token (not a cookie) that the browser keeps in local storage along with a cache of the current draft for instant rendering. Unclaimed guest drafts are deleted 30 days after last activity.
- Every edit, refinement and regeneration writes a revision; the editor shows one-step undo over them.
- No account is required for the first AI-generated playlist, which includes unlimited edits, refinements and regenerations of that one draft (subject to a per-draft cap on model-backed runs for cost control). Playing and copying it stay free forever.
- Sets built entirely by hand in the performance browser are free and do not count against the limit; they cost no model spend. The paywall appears the first time a second draft asks the AI for anything (generate, refine, regenerate, "let AI fill the rest").
- Clearing local storage yields a new token and another free playlist. This is accepted: a free playlist costs cents, and per-IP rate limits stop it being farmed. No fingerprinting.

### 7.7 Screen inventory

| Screen | Priority | Purpose | Primary components |
| --- | --- | --- | --- |
| Landing | P0 | Get a first-time user to a playlist in two interactions | Prompt box, mood chips, duration selector, secondary links to artist seed and manual browse, publisher names as text, one-line value proposition |
| Playlist editor | P0 | Review, adjust and hand off | Title, ordered list with thumbnails, runtime vs target, pin/remove/reorder/replace, conversational input with undo, Play on YouTube button |
| Performance browser | P0 | Manual discovery | Search, publisher/series/artist filters, performance cards, add-to-playlist, playlist drawer |
| Handoff sheet | P0 | Make the YouTube step obvious | Play on YouTube, Copy link, Share, one-line tips for saving the queue and casting to a TV |
| Sign-up and pay | P0 | Unlock the second playlist | Email link or Google sign-in (basic profile scope), session pass vs subscription, card or Apple Pay / Google Pay via hosted checkout, what is paid for stated plainly, the pending brief held throughout |
| Returning guest card | P0 | Second play without an account | The free set above the prompt on the landing page: title, runtime, Play on YouTube, Open |
| Library | P0 for paying users | Return to past sessions | Saved playlists, drafts, re-open in editor, hand off again |
| Account | P0 | Manage billing and data | Plan, cancel, update card (hosted billing portal), delete my data, (P1) connect YouTube |
| YouTube authorization | P1 | Explain and initiate API export | Why we ask, requested scope, Google consent, disconnect |

## 8. AI curator design

The curator is a server-side module built on a general-purpose LLM with structured outputs. It selects only from verified catalog IDs and returns a validated, ordered playlist. It reasons at the level it is reliable at and leaves the rest to the catalog. Artist-level knowledge is asked of the model once per artist at ingestion time and stored as an artist profile; at request time the model makes two calls, one to interpret the brief and one to order a short candidate list, so a generation fits the latency and cost budgets in section 13.

### 8.1 What the model reasons about (and what it doesn't)

| The model is trusted on | The model is **not** trusted on | How the gap is covered |
| --- | --- | --- |
| Artist similarity, genre, era, scene | Whether a specific performance is acoustic or full-band | Publisher/series conventions as a proxy; P1 feedback buttons; optional tags later |
| Typical energy and mood of an artist | Energy of one particular session | Artist-level energy as default; outliers corrected by user feedback |
| Publisher conventions (Tiny Desk = stripped-down, COLORS = one voice and a beat, KEXP = full band live, Live Lounge = acoustic covers) | Exact runtime | Duration from the catalog, not the model |
| Interpreting "mellow then groovy" into an energy curve | Whether a video is still available | Catalog availability flag, refreshed on a schedule |

The key simplification: **no performance-level tagging is required before launch.** Artist knowledge plus publisher conventions plus catalog duration give a credible arc. Performance-level tags are added only where users or editors supply them.

### 8.2 Processing flow

1. Receive the request (prompt, mood chip, seeds, duration, any publisher constraints in the text) and the current playlist state (items, pins, removals, prior instructions).
2. **Extract the brief** (one call, small fast model, structured output): target energy curve as segments over time, genres and scenes, seed artists, publisher and series constraints (including format requests like "full band only"), novelty preference, hard exclusions, duration in seconds. If the text names a duration, the text wins over the control. The brief is echoed to the user right away so a misread can be caught.
3. **Retrieve candidates in code** from artist profiles and the catalog: seeds' performances first, then similar artists, then profile matches on genre, scene and energy, filtered by constraints, removals and availability. Capped at about 150.
4. **Compose** (one call, main model, structured output): order the candidates to fit the curve and the duration, honouring pins in place. Candidates go in as compact data rows (id, artist, series, duration, artist energy, genres), never titles or descriptions.
5. **Validate and repair in code:** every ID came from this run's candidate set and is available; no excluded publisher; pins untouched; at most two appearances per artist, no duplicates; required artists present or explicitly reported missing; duration within ±10%, corrected in code by adding or dropping the best-fitting candidate because models sum durations badly.
6. Return the structured playlist plus a short rationale and any constraint warnings. A schema failure is retried once; a second failure leaves the draft untouched.

### 8.3 Artist profiles and catalog access

The model does not call tools at request time. Instead:

| Piece | Purpose |
| --- | --- |
| Artist profile (built at ingestion, one model call per new artist) | Genres, scenes, era, typical energy (1–5), similar artists resolved to catalog IDs. Editors can override any row; editor rows win |
| Candidate retrieval (SQL over profiles and the catalog) | Replaces request-time search tools; returns only `eligible AND available` performances |
| Proposed operations (output of the compose call) | Structured add / remove / replace / move for refinements, or a full ordered list for generation, validated by the app before any write |

Seeds not in the catalog have no profile; the brief step asks the model for their genres, scenes and energy and retrieval matches on that. The model never writes directly to playlist state; every change passes through application validation.

### 8.4 Guardrails

- Output is a JSON schema; anything else is rejected and retried once.
- Only catalog IDs in the same run's candidate set may appear in the output.
- Pins, removals and explicit exclusions are enforced in code, not by prompt.
- Titles and descriptions never reach the model at request time. Artist names do, after passing the ingestion parser and review queue; the system prompt is fixed.
- When a constraint cannot be met, the response says which and why; the UI surfaces it.

### 8.5 Model strategy

- One capable general model for everything in P0. No fine-tuning, no proprietary recommender.
- Model-agnostic adapter so the provider can change without touching the app.
- Embeddings and semantic retrieval deferred until the catalog is large enough that keyword retrieval visibly fails.
- Cost control: two model calls per generation, a small model for brief extraction; cap candidate set at \~150 performances per run; artist similarity precomputed in profiles rather than asked per request; at most 25 model-backed runs per draft.

## 9. Performance catalog

The catalog is the AI's only source of truth and, over time, the moat. At launch it is three publishers at full depth, with others listed but thin, and it carries only the fields the AI and the UI need.

### 9.1 Launch coverage

| Publisher | Series | Launch depth | Why |
| --- | --- | --- | --- |
| NPR Music | Tiny Desk Concerts | Full (all eligible) | Best-known brand; broad genre range; stripped-down format |
| KEXP | Live on KEXP | Full | Full-band live; indie/rock/global depth |
| COLORS | A COLORS SHOW | Full | R&B, hip-hop, soul; short, high-energy, visually distinctive |
| BBC Radio 1 | Live Lounge | Thin (top \~50) | Covers and pop; grows post-launch |
| Audiotree | Audiotree Live | Thin | Indie depth; grows post-launch |
| Paste | Paste Studio | Thin | Folk/Americana; grows post-launch |

Three publishers at full depth is well over 2,000 performances, and cheap to ingest because each channel's uploads playlist is paged at 1 quota unit per 50 videos.

### 9.2 Data model (per performance)

| Field | Source | Notes |
| --- | --- | --- |
| Internal ID | App | Stable |
| YouTube video ID | API | The only thing we must store |
| Artist(s) | API title parsed + editorial fix | Many-to-many |
| Publisher, series | Ingestion config | Our own classification |
| Duration | API `contentDetails` | Refreshed with availability |
| Upload date | API | Refreshed |
| Availability | API `videos.list` status | Refreshed every 7 days |
| Is a performance (vs interview, trailer, clip) | Rule + LLM + spot-check | Our own classification, stored as an eligibility flag plus a kind used by the review queue |
| Artist profile (genres, scenes, era, energy, similar artists) | Model general knowledge at ingestion + editor override | Our own data, keyed by artist, not derived from API content (see section 12) |
| Energy, mood, instrumentation per performance | **Optional, P1** | Written by user feedback and editors; absent at launch |
| Last verified | App | Drives refresh |

Fields that came from the API (title, duration, upload date, availability) live in a separate cache table, refreshed every 7 days and expired after the retention window set by the Phase 0 compliance memo. Titles are kept there because manual browse searches by title. Thumbnails are never stored (see section 12).

### 9.3 Ingestion

1. For each publisher, page the channel's uploads playlist with `playlistItems.list` (1 unit per page of 50). No `search.list`, which is capped at 100 calls per day.
2. Batch `videos.list` (1 unit per 50) for duration, status and upload date.
3. Classify performance vs non-performance by title rule first ("Tiny Desk Concert", "Live on KEXP"), LLM for ambiguous titles, human spot-check of a 10% sample.
4. Parse artist from title with a rule per series; LLM fallback; editorial review of anything the parser flags.
5. Build an artist profile for each new artist (section 8.3) and resolve similar artists to catalog IDs.
6. Mark eligible; expose to the curator's retrieval.
7. Weekly: re-check availability and duration for the whole catalog (about 50 units for 2,500 videos). Nightly: ingest new uploads and expire cache rows past retention. Weekly: flag a 10% sample of new rows for human review.

### 9.4 Growth

Thin publishers are deepened in priority order after beta. Candidates for the next tier: La Blogothèque (Take Away Shows), Jam in the Van, Sofar Sounds, Mahogany Sessions, Pitchfork sessions. Criteria: distinct format, consistent titling, active channel, no rights complications.

## 10. Export strategy

Export is the moment of value and the product's one external dependency. The MVP ships a zero-dependency path first and layers the API path on top once quota is secured.

### 10.1 Path A — URL handoff (P0)

YouTube accepts `https://www.youtube.com/watch_videos?video_ids=<id1>,<id2>,…` and opens the listed videos as a queue, converting the URL to a temporary playlist (`list=TLGG…`) that the user can save to their account with YouTube's own "Save" control. On mobile the link opens in the YouTube app, from which the user casts to a TV. Confirmed working by independent developers as of March 2026.

|  | Path A: URL handoff | Path B: Data API export |
| --- | --- | --- |
| User login required | No | Yes (Google OAuth) |
| Quota consumed | 0 | \~50 + 50 per video (a 20-video playlist ≈ 1,050 of a 10,000/day default) |
| Google verification review | No | Yes, for the `youtube` scope |
| Playlist saved automatically | No, one tap in YouTube | Yes |
| Max length | \~50 videos per link | Unlimited |
| Risk | Undocumented; could be retired | Quota extension can take weeks; no paid tier |
| Launch status | **P0** | P1 |

Mitigations for Path A's risk: a daily automated check that the URL still resolves to a queue; a fallback button that copies the video list; and Path B built in parallel so the switch is a runtime flag that needs no deploy.

### 10.2 Path B — Data API export (P1)

Apply for a quota extension during Phase 0 with real usage projections. Build OAuth with the minimum scope, store refresh tokens server-side only, verify every insert via the API response, and prevent duplicate exports with an idempotency key per playlist revision. Expose as "Save to my YouTube" beside "Play on YouTube" once quota is approved.

### 10.3 Preview (P1)

The documented YouTube IFrame Player accepts a `playlist=` parameter with comma-separated IDs at no quota cost. Use it for an in-app audition player in the editor, not for primary playback.

## 11. Technical architecture

A single Next.js application with the server side organised as modules in one codebase (catalog, curator, playlist, billing, events) plus one scheduled ingestion worker; (P1) a YouTube integration module. Nothing in the P0 request path touches the YouTube API; the API is used only by the ingestion worker. The full design is in `docs/architecture/architecture.md`; this section is the summary it has to stay consistent with.

| Component | Responsibility | P0 dependencies |
| --- | --- | --- |
| Web client (Next.js/React, Tailwind) | Prompt, editor, manual browse, URL handoff, guest token and draft cache in local storage | None external |
| Application API (Next.js routes) | Validation, playlist state and revisions, entitlement checks, rate limiting, analytics events | Postgres |
| Curator module | Brief extraction, candidate retrieval, composition, validation; conversational edits | LLM provider, catalog module |
| Catalog module | Verified performance retrieval and filtering; artist profiles; availability flags | Postgres |
| Billing module | Entitlements, hosted checkout (cards and wallets), webhooks, billing portal | Stripe, Postgres |
| Ingestion worker (scheduled) | Pulls uploads playlists, classifies, parses artists, builds profiles, verifies, refreshes, checks the handoff URL | YouTube Data API, read-only, about 100 units/day; LLM provider |
| YouTube integration module (P1) | OAuth, playlist insert, export jobs, idempotency | YouTube Data API write scope, quota extension |
| Database (Postgres on Supabase) | Catalog, drafts, revisions, guests, users, entitlements, events | None |

### Playlist state

Playlist state is first-class and independent of any chat history. Each draft stores its creation method, duration target, title and description; each revision is an immutable snapshot of the ordered items (with pin state and source), the removals, the brief and the instruction that produced it. Undo writes a new revision equal to the previous one, the AI diff view compares two snapshots, and a handoff records exactly which revision it sent. The curator reads this state and writes to it only through validated operations.

### Application entities

| Entity | Holds | Notes |
| --- | --- | --- |
| Guest | Hashed anonymous token, created and last-seen dates, beta cohort | Issued on first generate; owns drafts until claimed |
| User | Identity, sign-in method, created date | Created at sign-in, which comes just before payment; claims the guest's drafts |
| Entitlement | Session pass or subscription, status, period end, payment provider ids; the draft a pass is bound to | One active entitlement per user |
| Publisher, Series | Channel id, display name, titling rules, launch depth, format convention | Our own configuration |
| Artist, ArtistAlias, ArtistProfile | Canonical name, aliases; genres, scenes, era, energy, similar artists | Many performances; many artists per performance via PerformanceArtist |
| Performance | YouTube video id, series, eligibility, kind, review status, last verified | Our own editorial row; API-sourced fields live in a separate expiring cache |
| PlaylistDraft | Owner (user or guest), creation method, status, duration target, title, description | Several per subscriber; one free AI draft per guest |
| PlaylistRevision | Draft, revision number, snapshot of items, removals, brief, trigger, instruction | The only store of items; powers undo and the AI diff view |
| CuratorRun | Draft, kind, brief, candidate ids, output ids, warnings, model, tokens, latency, error | Observability and evals |
| HandoffEvent | Draft, revision, type (open, copy, share), part, start index, surface, timestamp | Export measurement in P0 |
| ShareLink | Code, draft, revision, start index | Backs the getmarquee.tv redirect |
| YouTubeConnection, ExportJob | P1 | OAuth tokens (server-side), export status, idempotency key |

### Hosting and operations

Vercel for the app, Supabase for Postgres and auth, Stripe Checkout and Customer Portal for payments, GitHub Actions schedules for the ingestion worker, a cookieless page-analytics tool for traffic sources, first-party journey events in Postgres, and application error monitoring. All are initial recommendations; none is load-bearing for the design.

## 12. YouTube compliance and data handling

The design keeps the app on the conservative side of YouTube's API terms by storing almost nothing from the API and deriving nothing from it that we keep.

- **Store the minimum.** Video ID, our publisher/series classification, our performance-or-not flag, our artist mapping, and verification timestamps. These are our own editorial data.
- **Refresh, don't hoard.** Title, duration, upload date, availability and thumbnail reference are refreshed on a 7-day cycle and treated as cache, which aligns with the API's data-retention expectations. Confirm the current retention window in the YouTube API Services Terms during Phase 0.
- **Thumbnails** are displayed via YouTube's image URLs with the video linked, never copied or re-hosted.
- **No AI-derived data from API content at launch.** Energy, mood and instrumentation tags per performance are absent in P0. When added (P1), they come from user feedback and editors, not from processing API metadata, which sidesteps the restrictions on machine-learning use of API data. LLM classification of API titles at ingestion yields an eligibility flag and a kind (performance, interview, trailer, clip) used only to route the review queue, plus an artist name that must match the parser's candidates; confirm with the developer policies that this counts as classification, not stored descriptive data.
- **Artist profiles** (section 8.3) are the model's general knowledge about a named artist, generated once per artist and editable by editors. The name comes from parsing an API title, but the profile's content does not derive from API data. The Phase 0 memo must say so explicitly; if the reading is rejected, the fallback is request-time similarity lookups with a cache, at higher latency and cost.
- **No playback inside the app** in P0. Links go to YouTube. P1 preview uses the official IFrame player only.
- **Branding.** Publisher names appear as plain text with their channel linked; no logos, no implied endorsement.
- **Accounts (P0).** Sign-in uses Google's basic profile scope or an email link. A privacy policy and terms of service are published before launch, because Google's consent screen and Stripe both require them. Delete-my-data lives in the Account screen.
- **YouTube OAuth (P1).** Incremental grant of the minimum `youtube` scope, server-side tokens, disconnect control.
- **Phase 0 deliverable:** a one-page compliance memo citing the specific clauses of the API Services Terms and Developer Policies that cover storage, refresh, derived data, artist profiles and attribution, with the decisions above checked against each.

Paid access (section 16) covers our curation, editor and library, never YouTube data or playback. Confirm in the Phase 0 memo that this is consistent with the API terms' restrictions on charging for API data, and keep the pricing page wording aligned with it.

## 13. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Speed | Playlist generation under 8 s at p90; streaming progress shown after 1 s. Catalog search under 300 ms. |
| Reliability | Playlist state survives errors and reloads. A failed AI call never removes user picks. URL handoff works offline from the app's point of view once the list exists. |
| Cost | Under $0.05 in LLM spend per generation; under $0.20 per draft including refinements (section 16.2). Two calls per generation, a small model for the brief, the candidate cap and the per-draft run cap enforce it. Both figures are measured from CuratorRun rows. |
| Accessibility | Keyboard reorder alternative to drag-and-drop; labelled controls; WCAG AA contrast; screen-reader order matches visual order. |
| Security | Server-side secrets; input validation; per-IP rate limits on generation; model prompts treat catalog text as untrusted data. |
| Privacy | No account before the first playlist; no tracking cookies; first-party anonymous analytics only. Guest identity is a random token in local storage, not a cookie. Privacy policy and terms published at launch, before the first sign-in. |
| Observability | Every generation logs brief, candidate count, output IDs, validation warnings and latency, keyed to an anonymous session. |

## 14. Development phases

Five phases, each with a hard exit gate. Phase 0 is short because the URL handoff needs no OAuth or quota to validate; what remains is confirming it works on every surface, checking compliance, and starting the quota clock for P1.

| Phase | Objective | Key deliverables | Exit gate |
| --- | --- | --- | --- |
| **0. De-risk** (1–2 weeks) | Confirm the launch path and start long-lead items | URL handoff tested on desktop, iOS, Android, cast-to-TV and the Instagram in-app browser, including "play from here" while casting and a short-link redirect into the YouTube app; what `watch_videos` returns to a non-browser client; ingestion of one channel end-to-end; compliance memo; quota extension application submitted | Handoff works on all five surfaces; one publisher fully ingested |
| **1. Catalog** (2–3 weeks) | Build the source of truth | Three publishers at full depth; performance classifier; artist parser; artist profiles; weekly refresh and expiry jobs; review-queue procedure; catalog search API | 2,000+ eligible performances; under 2% misclassified in a 200-item audit |
| **2. Curator** (3–4 weeks) | Deliver the intelligence | Brief extraction; candidate retrieval over profiles; composition with energy arc; validation and repair layer; conversational edit ops; eval runner and set of 50 prompts | 45 of 50 eval prompts rated acceptable by two reviewers; zero invalid IDs in 500 runs; p90 under 8 s |
| **3. App** (3–4 weeks) | Ship the end-to-end experience | Landing + prompt; artist seed; manual browse; editor with pins, reorder, undo; URL handoff, play from here, share links; guest persistence and returning-guest card; sign-up, payment and the paywall; library; account screen; privacy policy and terms; broken-handoff runbook; analytics | A first-time user goes from landing to YouTube playing in under 60 s with no help |
| **4. Private beta** (4 weeks) | Learn whether it is wanted | 30–50 invited users, weighted to social hosts; paywall on, half the cohort offered the session pass and half the subscription; weekly metrics review; "did you play it again?" survey at day 7 | Metrics in section 15 hit or a clear reason why not |

Phases 1 and 2 overlap once the catalog schema is stable. P1 API export begins when the quota extension is approved, whichever phase that lands in.

## 15. Success metrics

**North star: playlists handed to YouTube that are played a second time.** It measures the whole promise, not just completion. Because the P0 export is a URL, the second play is measured by a day-7 survey in beta, plus two P0 proxies: a second handoff of the same draft from the returning-guest card or the library, and opens of a shared link.

| Area | Metric | Beta target |
| --- | --- | --- |
| Activation | Visitors who submit a prompt | 50% |
| Activation | Median time from landing to handoff | Under 60 s |
| Quality | AI-selected performances kept in the final list | 75% |
| Quality | Playlists regenerated from scratch | Under 20% |
| Quality | Constraint warnings per playlist | Under 0.3 |
| Export | Generated playlists handed to YouTube | 60% |
| Export | Handoff link opened or copied without error | 98% |
| Retention | Beta users who report playing a playlist a second time | 40% |
| Retention | Users who create a second playlist within 30 days | 30% |
| Discovery | Kept performances by artists the user did not name | 50% |
| Revenue | Free users who pay when starting a second playlist | 8% |
| Revenue | Monthly revenue as a share of infrastructure plus LLM cost | 100% within 3 months of public launch |

Targets are hypotheses to validate, not forecasts. The two that decide whether to continue are second-play rate and second-playlist rate.

## 16. Business model

The first AI-generated playlist is free, with no account, and includes the full editor, conversational refinement and the YouTube handoff. Every AI-generated playlist after it is paid; sets built by hand stay free (7.6). The goal is to cover costs from launch, not to maximize revenue, so pricing is simple and the free experience is complete enough to prove the value.

### 16.1 Tiers

|  | Free | Session pass | Subscription |
| --- | --- | --- | --- |
| Price | $0 | $2.99 one-off | $4.99/month |
| Playlists | The first AI set, in full, plus any number of hand-built sets | One new AI set plus 7 days of edits and regenerations; after day 7 it stays playable and copyable but the editor is read-only | Unlimited while active; read-only but playable after cancellation |
| Account | None | Required (email link or Google sign-in, basic profile scope only) | Required |
| Payment | — | Card, Apple Pay or Google Pay through hosted checkout | Same |
| Library | The free set, in this browser | Saved, with the free one migrated in | Saved, unlimited |
| Who it fits | Everyone, once | Social hosts who entertain a few times a year | Enthusiasts and frequent hosts |

Annual billing ($39/year) is deferred until beta shows subscribers retaining past month three.

Two paid options exist because the beachhead user is occasional. A host who entertains monthly will not subscribe but will pay $3 for one great party. The subscription catches the enthusiast and the frequent host. Beta tests whether both are needed (see 16.4).

### 16.2 Unit economics

| Item | Estimate | Basis |
| --- | --- | --- |
| LLM cost per draft, including refinements | $0.10–$0.20 | Under $0.05 per generation (section 13); 2–3 refinement turns on average; hard cap of 25 model-backed runs per draft |
| Fixed infrastructure per month at launch | $75–$150 | Hosting, Postgres, scheduler, monitoring, email |
| Payment processing | 2.9% + $0.30 per charge | Standard card rates; about 13% of a $2.99 pass, 9% of a $4.99 month |
| Gross margin per session pass | about $2.40 | $2.99 less fees and LLM cost |
| Gross margin per subscriber-month | about $4.00 at 3 playlists/month | $4.99 less fees and LLM cost |
| Break-even | About 40 subscribers, or about 65 session passes a month | Covers fixed costs at the upper estimate ($150 ÷ $4.00; $150 ÷ $2.40) |

Free first playlists are a marketing cost of $0.10–$0.20 each. At 1,000 free playlists a month that is up to $200, covered by roughly 50 subscribers or 85 passes. Rate limits (section 13) keep abuse of the free tier from running away.

### 16.3 What is paid for

The charge is for the curation, the editor and the library, which are our own work. It is not for access to YouTube data or playback, which stay free on YouTube. This framing matters for the API terms (section 12) and should be stated plainly on the pricing page.

### 16.4 Beta pricing test

The paywall is on during private beta so willingness to pay is measured, not assumed. Half the cohort sees the session pass as the default offer and half sees the subscription; both see the other as a secondary option. Decide after beta whether to keep both. Beta users who pay keep their price for life as a thank-you.

### 16.5 Later options (not in scope)

Annual billing, crediting a session pass toward a subscription bought within the 7 days, referral credit (one free playlist per friend who makes one), gift passes for hosting occasions, and publisher partnerships. None is needed to be self-sustaining.

## 17. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| YouTube retires the `watch_videos` URL | Medium | High | Daily automated check; copy-list fallback behind a runtime flag; P1 API export behind the same flag; quota application filed in Phase 0; runbook written before launch |
| Quota extension denied or slow | Medium | Medium | P0 does not need it; P1 waits; usage projections in the application |
| Arc feels generic without performance-level tags | Medium | Medium | Publisher conventions as proxy; P1 feedback buttons; editorial tags for the 100 most-played performances |
| Catalog dead ends on niche requests | Medium | Medium | Depth-first catalog; honest "nothing here, try these" responses; log unmet requests to drive expansion |
| Compliance reading of derived data is stricter than assumed | Low | High | Store no derived descriptive data from API content in P0; Phase 0 memo with clause citations |
| LLM cost at scale | Low | Medium | Candidate cap, similarity cache, cheaper model for brief extraction |
| Users just use YouTube | Medium | High | Lead with the arc and the 60-second promise; measure second-play honestly and act on it |
| Scope creep toward a music app | Medium | Medium | Principle 1; P0 table is the contract |

## 18. Decisions

### 18.1 Decided (Nov 8, 2026, from the journeys and architecture review)

| Decision | Call | Applied in |
| --- | --- | --- |
| What counts as the free playlist | One draft is one playlist; refinements and regenerations inside it are free, with a cap of 25 model-backed runs. Hand-built sets never count; the paywall gates model-backed runs, not drafts | 7.6, 16 |
| Where the paywall sits | After the brief is written. The brief is held through sign-in and payment and generates without retyping | 7.7, journeys J7 |
| Guest state | Drafts on the server under an anonymous bearer token; local storage holds the token and a render cache. The sign-in link carries a one-time claim code so a different browser still claims the drafts. Unclaimed guest drafts kept 30 days | 7.6, 11 |
| Handoff sheet | Shown on the first handoff per browser; direct to YouTube afterwards | 5, 7.5 |
| Typed duration vs the control | The text wins; the brief echo shows the result | 5, 8.2 |
| Pinned item vs an instruction to remove it | The newer explicit instruction wins; the diff says so | 7.4 |
| Manual picks | Pinned for inclusion; position-locked only once the user moves a row | 7.4 |
| Session pass after day 7 | Playable and copyable forever; editor read-only | 16.1 |
| Play from here | In P0 | 6, 7.5 |
| Wallet payments | Apple Pay and Google Pay through hosted checkout, P0 | 7.7, 16.1 |
| Annual plan | Deferred | 16.1, 16.5 |
| Pass credited toward a subscription | Deferred | 16.5 |
| Branded share link | In P0: getmarquee.tv short link redirecting to the YouTube URL | 6, 7.5 |
| Accounts in P0 | Supabase Auth with Google basic profile or email link; privacy policy and terms at launch. P1 adds an incremental Google grant for the `youtube` scope, so no separate linking system is needed | 12, 13 |
| Curator shape | Artist profiles precomputed at ingestion; two model calls per generation; retrieval in SQL | 8 |
| Replace one | Catalog query on energy and length, no model call | 7.4 |
| Handoff URL check | Daily | 7.5, 17 |
| Publisher filter | Natural language only in P0; filter UI is P1 | 5, 6 |

### 18.2 Still open

- [ ] **Name and brand.** "Marquee TV" is the name, getmarquee.tv the domain, @marquee.tv the Instagram handle. Remaining: trademark search in the software and entertainment classes.
- [ ] **Duration control.** Section 7.1 specifies presets (30 min, 1 h, 2 h, 3 h, custom); the mockups use a ±30 min stepper around 2 h. Pick one and update the other.
- [ ] **Duration tolerance.** ±10% is the proposed default. Decide whether the user can tighten it, and whether the editor offers "Fill to 2 h" when removals leave a shortfall.
- [ ] **Artist repetition cap.** Two appearances per artist is proposed. Confirm with beta feedback.
- [ ] **Undo depth.** One step in the UI; revisions support more. Decide whether to expose history.
- [ ] **Refunds.** What happens when a pass buyer's generation fails and they give up. Write it down before the first charge, even if the answer is "email us".
- [ ] **Catalog expansion governance.** Editorial-only, automated with review, or user-requested? Proposal: automated with a 10% human audit.
- [ ] **Pricing.** Session pass, subscription or both; exact price points. Section 16 proposes both at $2.99 and $4.99, tested in beta.
- [ ] **Preview player.** Confirm whether the IFrame embed with `playlist=` is wanted in P1 or whether "Play on YouTube" is enough.
- [ ] **Phone reorder.** The phone mockups use Up/Down buttons with no drag. Fine if deliberate; record it in the design spec.

## 19. Product definition

Marquee TV is an AI-native live-music discovery and playlist creation app. A user describes a mood, names an artist or browses by hand; the AI curator assembles an ordered session of verified live performances from selected publishers, with a deliberate energy arc over the requested duration; the user adjusts it by hand or in plain language; and one tap hands it to YouTube to play on any screen. The first AI-built session is free. After that, a session pass or a subscription keeps the product self-sustaining.

The promise: *Tell us how you want the room to feel. We'll find the performances and put them in the right order. YouTube does the rest.*

## Sources

- [YouTube Data API: quota costs](https://developers.google.com/youtube/v3/determine_quota_cost) — 10,000 units/day default; 50 units per `playlists.insert` and `playlistItems.insert`; 1 unit per `playlistItems.list` and `videos.list`; `search.list` capped at 100 calls/day.
- [YouTube Data API: getting started](https://developers.google.com/youtube/v3/getting-started) — quota extension request process.
- [watch\_videos URL handoff, confirmed March 2026](https://dev.to/roshan_jaiswal_b3fb04eb75/i-discovered-a-way-to-create-a-saveable-youtube-music-playlist-from-any-list-of-video-ids-no-40nn) — independent developer write-up of the queue-from-IDs behaviour.
- [OutlierKit: YouTube API quota guide](https://alpha.outlierkit.com/resources/youtube-api-quota/) — no paid quota tier; extension timing.
