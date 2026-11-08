# Marquee TV: user journeys

Nov 8, 2026 · @Taylor Hickman · Version 0.2 · Status: Draft · Built from PRD v1.1 and the mockups in `design/mockups.html`

**Changes in 0.2.** The decisions proposed in section 5.3 were made and recorded in PRD 1.1 section 18.1; this doc now cites them as settled. J9 moved from proposed to P0. Guest drafts live on the server. Annual billing and pass-to-subscription credit were deferred.

## 1. How to use this doc

The PRD has one core journey (section 5). Building the app needs more than that. Each persona enters at a different point, the paywall splits the product into a before and an after, and the YouTube handoff behaves differently on every device. This doc writes each of those paths out step by step, so design and engineering can see every screen and state a person passes through.

Each journey gives the person, what prompted them, what they want, and a table of steps. The Screen column names the mockup board by its label in `mockups.html` (for example `Editor · default`). "Not mocked" marks a screen or state the journey needs that has no mockup yet. Section 5 collects those gaps along with the places where the mockups disagree with the PRD and the decisions the journeys force.

When this doc and the PRD disagree, the PRD wins until one of them is updated (see `docs/README.md`).

## 2. Journey index

| ID | Journey | Persona | Priority | Starts at | Mockup coverage |
| --- | --- | --- | --- | --- | --- |
| J1 | First set for a party | Social host | P0 | Landing | Full |
| J2 | Adjust the set before playing | Host, enthusiast | P0 | Editor | Partial |
| J3 | Start with an artist | Enthusiast | P0 | Landing → artist seed | None |
| J4 | Build it yourself | Enthusiast, host with must-plays | P0 | Landing → browser | Partial |
| J5 | Hand off to YouTube and get it on the TV | Everyone | P0 | Editor | Full on the happy path |
| J6 | Come back as a guest | Host | P0 | Landing (returning) | None |
| J7 | Pay for the second set | Host, enthusiast | P0 | New set | Partial |
| J8 | Return as a paying user | Subscriber, pass holder | P0 | Library | Partial |
| J9 | Change the set mid-party | Host | P0 | Editor while YouTube plays | None |
| J10 | Manage account and data | Paying users | P0 | Account | None |
| J11 | When things go wrong | Everyone | P0 | Anywhere | Partial |
| J12 | Save to my YouTube | Enthusiast, subscriber | P1 | Handoff sheet | None |
| J13 | Audition before playing | Enthusiast | P1 | Editor | None |
| J14 | Ask why, tell us it's wrong | Explorer | P1 | Editor | None |
| J15 | Review flagged catalog items | Catalog editor (internal) | P0 | Review queue | None |
| J16 | Respond to a broken handoff URL | On-call (internal) | P0 | Daily check alert | None |

J1 and J5 together are the 60-second promise. If time runs short, build and test those two first.

## 3. P0 journeys

### J1. First set for a party

**Who.** A social host on their phone. Friends arrive in twenty minutes. The TV has the YouTube app or a Chromecast. They found getmarquee.tv through @marquee.tv on Instagram or a friend.

**Wants.** Good live music on the TV, in a sensible order, for the whole party, without touching it again. No account.

**Starting state.** First visit, nothing in local storage.

| # | Person does | App does | Screen | Time budget |
| --- | --- | --- | --- | --- |
| 1 | Opens getmarquee.tv | Shows the prompt, six mood chips and the duration control set to 2 hours | `Landing · empty` | 5 s |
| 2 | Taps Dinner Party | Prefills the prompt with a brief they can edit | `Landing · chip selected` | 5 s |
| 3 | Taps Make my playlist | Echoes the brief ("2 hours · starts mellow"), shows progress steps within 1 s, estimates time left | `Generating · in progress` | 8 s at p90 |
| 4 | Glances at the list | Shows the title, a one-line arc ("Solo voices and small rooms for the first forty minutes, full bands and horns by the second hour"), runtime against target and the energy bar from Mellow to Groovy | `Editor · default` | 10 s |
| 5 | Taps Play on YouTube | Opens the handoff sheet with the YouTube button and the two tips (see J5) | `Handoff sheet` | 5 s |
| 6 | Taps Play on YouTube in the sheet | Opens the `watch_videos` URL; the YouTube app claims it and loads the queue | YouTube | 5 s |
| 7 | Taps Cast in YouTube and picks the TV | Nothing; this happens in YouTube | YouTube | 10 s |

That adds up to about 48 seconds with no editing, which leaves some slack for a typed prompt. A typed prompt costs 10 to 20 seconds more, so the chips do most of the work for the 60-second target.

**Done when.** `handoff_opened` fires within 60 s of `landing_viewed` in the same anonymous session (PRD 15: median under 60 s; 60% of generated sets handed off).

**Variations.**
- They type their own brief instead of tapping a chip. If the text names a duration ("three hours") and the control says 2 hours, the text wins and the brief echo in step 3 shows the duration it used, so the person can catch a misread (PRD 18.1).
- They tap Surprise Me. This is the explorer's way in at P0. The arc still applies; only the artist pool is wider.
- They're on a laptop plugged into the TV. Same steps, and step 7 goes away. See the J5 surface table.

**What can go wrong.** Generation fails, the brief hits a catalog dead end, or the constraint warning appears: all in J11. The YouTube app isn't installed, or they're inside Instagram's in-app browser: see J5.

### J2. Adjust the set before playing

**Who.** Most hosts skip this. Those who don't make one or two fixes. Enthusiasts stay a while.

**Prompted by.** One performance they don't want, an artist they love that should stay, or a general "this is too sleepy".

**Starting state.** A generated set in the editor.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Taps Pin on Khruangbin | Marks the row Pinned and changes the button to Unpin | `Editor · one item pinned` |
| 2 | Taps Remove on a row | Drops the row and updates the runtime. The removal is permanent for this draft: no regeneration brings it back | `Editor · default` (no removal state mocked) |
| 3 | Taps Replace on a row | Offers three alternatives that fit the slot's energy and length; they pick one | Not mocked |
| 4 | Moves a row with Up/Down (phone) or drags (desktop) | Reorders; screen-reader order follows | `Editor · default` |
| 5 | Types "funkier in the second half" and taps Apply | Proposes changes, applies them, and shows the diff: "Changed" banner, removed rows struck through, new rows tagged New, new runtime, Undo | `Editor · AI change with undo` |
| 6 | Taps Undo | Restores the previous revision in one step | `Editor · default` |
| 7 | Regenerates everything unpinned | Keeps pins and removals, rebuilds the rest against the same brief | Not mocked (no visible control) |
| 8 | Renames the set | Saves title and description | Not mocked (no visible control) |

**Rules that hold throughout.** Pins and removals survive every regeneration and refinement; code enforces this, not the prompt. Playlist state lives in the draft, not in the chat history, so a reload keeps everything. A failed refinement changes nothing and leaves the instruction in the box.

**Done when.** The person hands off (J5). Quality signals: 75% of AI picks kept, under 20% of sets regenerated from scratch, under 0.3 constraint warnings per set.

**Decided (PRD 18.1).** If someone types "drop Khruangbin" while Khruangbin is pinned, the newer explicit instruction wins, and the diff says "Unpinned and removed Khruangbin" so it is visible and undoable.

**Open points (PRD 18.2).**
- Removing rows can push the runtime outside the ±10% tolerance. Should the editor offer "Fill to 2 h" or just show the shortfall? Showing it plus a one-tap fill is cheap and keeps the person in control.
- Undo is one step in the PRD. `PlaylistRevision` can support more. Decide whether the UI exposes more than one step.

### J3. Start with an artist

**Who.** The live-session enthusiast. They just finished Khruangbin's Tiny Desk and want more like it from KEXP and COLORS as well.

**Starting state.** On the landing page. They may or may not already have a free set.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Taps Start with an artist | Opens the artist seed view with a typeahead | Not mocked |
| 2 | Types "Khru" | Suggests catalog artists with a performance count ("Khruangbin · 3 performances") | Not mocked |
| 3 | Picks Khruangbin, adds Hiatus Kaiyote | Shows both as seeds; "Must include these artists' performances" is on by default because both are in the catalog | Not mocked |
| 4 | Optionally adds a mood and changes the duration | Same controls as the landing | Not mocked |
| 5 | Generates | Same progress screen and editor as J1, with the seeds' performances in the set | `Generating · in progress`, `Editor · default` |
| 6 | Edits more than a host would (J2), then hands off (J5) | | |

**Edge cases the seed view must handle.**
- The artist isn't in the catalog (say, Radiohead). The app accepts them as influence only, says so in one line ("Not in our catalog yet. We'll use them as a reference."), and disables the must-include toggle for that seed.
- The artist is in the catalog but none of their performances is eligible right now, for example all unavailable. The app says so and offers the closest artists that do have one. It never fills the slot with a lookalike and stays quiet about it (PRD 7.2).
- A spelling or alias match ("Tank & the Bangas"). The `Artist` entity carries aliases; the typeahead must search them.
- The seed's only performance is longer than the whole target (a 31-minute KEXP set in a 30-minute session). The constraint warning explains it and offers to stretch the duration.

**Done when.** A handoff happens, and at least half of the kept performances come from artists the person didn't name (PRD 15 discovery target).

**Open point.** Should must-include performances arrive pinned? If not, a regeneration can't drop them anyway (validation enforces must-include), but the person can't tell that. A "Your pick" tag on those rows, without a full pin, would show it.

### J4. Build it yourself

**Who.** An enthusiast who wants control, or a host with three songs they must have.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Taps Build it yourself | Opens the browser with search, Publisher, Series and Artist filters, an "Under 20 min" quick filter and Newest first sort | `Performance browser` |
| 2 | Searches, filters, taps Add | Adds to the drawer; the drawer shows the count and runtime against the target ("50 m of a 2 h target") | `Browser · drawer open` |
| 3a | Taps Open in editor | Opens the editor with their picks, in the order added, marked as manual | `Editor · default` |
| 3b | Taps "Let AI fill the rest" | Turns the picks into pins and builds the rest of the arc around them | Not mocked |
| 4 | Hands off (J5) | | |

**Edge cases.**
- No results. "Nothing matches. Check the spelling or clear a filter." Catalog search must answer in under 300 ms.
- "Start over" sits in the browser header. Confirm whether it clears the drawer, and ask before throwing picks away.
- Enough short COLORS sets to exceed 50 videos. The handoff splits into parts (J5).

**Decided (PRD 18.1).**
- Picks from the browser are pinned for inclusion, with the curator free to place them; a position lock applies only when the person moves a row by hand (PRD 7.4). Rows should carry a "Your pick" tag so the distinction is visible.
- A set built entirely by hand does not count as the free playlist and never meets the paywall. Only model-backed runs are gated, so tapping "Let AI fill the rest" on a second set is what triggers J7 (PRD 7.6).

### J5. Hand off to YouTube and get it on the TV

**Who.** Everyone, at the end of J1 to J4 and again in J6 and J8. This is the moment of value, and the only step that depends on someone else's product.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Taps Play on YouTube in the editor | Opens the sheet: "Ready. YouTube takes it from here.", the set summary, Play on YouTube, Copy link, Share, and two tips ("To keep it": tap Save in YouTube; "For the TV": tap Cast in the YouTube app) | `Handoff sheet` |
| 2 | Taps Play on YouTube | Builds the `watch_videos` URL from the current revision, opens it, logs `HandoffEvent(open)` | YouTube |
| 2b | Taps Copy link or Share | Copies a getmarquee.tv short link that redirects to the same queue, or opens the native share sheet with it; logs `copy` or `share` (PRD 7.5) | `Handoff sheet` |
| 3 | Returns to the tab later | Sheet offers Back to the editor | `Handoff sheet` |

**Over 50 videos.** The sheet switches to parts: "Birthday, Loud is 62 videos. A YouTube queue holds 50, so it comes in two. Start Part 2 when Part 1 ends." Each part gets its own button with its video range and runtime (`Handoff · two parts`). The host has to come back to start Part 2, possibly hours later, mid-party. Offering "Trim to 50 and keep the arc" next to the split would let most hosts avoid that. With 20-minute Tiny Desk sets, 50 videos is many hours of music, so only sets built from short videos hit this.

**Surfaces.** Phase 0 has to confirm each row. The middle column is the expected behaviour, not a tested one.

| Surface | What Play on YouTube should do | How it reaches the TV | Risk |
| --- | --- | --- | --- |
| iPhone, YouTube app installed | Universal link opens the app with the queue | Cast in the app | Low |
| iPhone, no YouTube app | Opens m.youtube.com in Safari | No cast button in mobile Safari; the person installs the app or uses AirPlay mirroring | Medium: needs a hint |
| Android, YouTube app installed | The app claims the link | Cast in the app | Low |
| Desktop Chrome | New tab | Chrome's Cast menu, or the laptop is on HDMI | Low |
| Desktop Safari or Firefox | New tab | HDMI, or send to phone with Copy link / Share | Medium |
| Instagram or another in-app browser | May load YouTube inside the in-app browser instead of the app | No cast | High: Instagram is the launch marketing channel |

The in-app browser row deserves its own Phase 0 test and probably its own hint ("Open in your browser for the TV"). It also affects J6, because the in-app browser keeps its own local storage.

**Done when.** The link opened or copied without error (98% target).

**What can go wrong.**
- The desktop browser blocks the new tab. Open it straight from the click handler, never after an `await`.
- A video went unavailable after the last weekly refresh. YouTube skips it in the queue. The app can't see this in P0. A spike in "missing track" reports would argue for refreshing more often than weekly.
- YouTube retires the URL format. The button becomes "Copy video list" (J11, J16).

**Decided (PRD 18.1).** The sheet shows on the first handoff in a browser; after that the editor button opens YouTube directly and the sheet stays reachable. The mockups show the first-time path; the direct path needs no new board.

### J6. Come back as a guest

**Who.** The host, a day or a few days after the party, same phone, same browser. This is where the north-star second play happens, or where the person starts a second set and meets the paywall.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Opens getmarquee.tv | Finds the guest token in local storage, loads their drafts from the server (the free set and any hand-built sets) and shows them above the prompt: title, runtime, Play on YouTube, Open | Not mocked |
| 2a | Taps Play on YouTube | Hands off the saved set again (J5). This is a second play the app can count | `Handoff sheet` |
| 2b | Taps Open | Opens the free set in the editor; editing it stays free | `Editor · default` |
| 2c | Starts a new brief | Goes to J7 | |

**What can go wrong.** Different browser, different device, private window, cleared storage, or the Instagram in-app browser the first time and Safari now. The set is gone from Marquee's side. If they saved the queue in YouTube they still have it there, which is why the "To keep it" tip matters. After the first set exists, an optional "Email me this set" would close the gap without breaking the no-email-before-first-playlist rule (PRD 7.1). Treat it as a proposal.

**Decided (PRD 18.1).** One draft is one playlist; regenerations and refinements inside it are free and show up as revisions with undo, not as separate playlists.

### J7. Pay for the second set

**Who.** A host who liked the first set and has another party coming, or an enthusiast who wants to keep going.

**Starting state.** A free set exists in this browser. No account.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Taps New set, picks a chip or types a brief, submits | Creates the draft, holds the brief on it, and shows the plan screen instead of generating | Not mocked (brief held) |
| 2 | Reads "Your first set was on us." and picks a plan | One set at $2.99 or every set at $4.99 a month; in beta the default plan depends on the cohort (PRD 16.4) | `Sign up · choose plan` |
| 3 | Taps Continue with Google | Signs in with basic profile scope only; the `User` is created and the guest's drafts move into the account | `Sign up · choose plan` |
| 3b | Or enters an email and taps Email me a sign-in link | Sends a link carrying a one-time claim code and shows "check your email" | Not mocked |
| 4 | Pays with card, Apple Pay or Google Pay in hosted checkout | Charges and creates the `Entitlement` | `Sign up · enter payment` |
| 5 | Waits | Generates the held brief straight away and opens the editor | `Generating · in progress` → `Editor · default` |

The held brief matters. If the person types it, pays and then has to type it again, the paywall feels like a penalty. Asking for payment before they type would also mean they pay before they know what they'll get.

**What can go wrong.**
- The email link opens in a different browser from the one that holds the free set (a mail app's in-app browser, or a desktop link opened on the phone). Local storage doesn't come along. Because drafts and the held brief live on the server and the link carries a claim code (PRD 18.1), nothing is lost; the new browser just needs to finish payment.
- The card is declined. The person stays on the payment form with a plain message, and the brief and plan are kept. Not mocked.
- They back out at the plan screen. They go back to their free set, which still works.
- They already have a subscription from another device. After sign-in the app skips payment and goes straight to step 5.

**Done when.** `payment_completed` followed by `generation_completed`. Target: 8% of free users pay when starting a second set.

**Decided (PRD 18.1).** Monthly only; annual billing is deferred, so the plan screen is right as mocked. Apple Pay and Google Pay come through hosted checkout and should appear on the `Sign up · enter payment` board.

### J8. Return as a paying user

**Who.** A subscriber planning the next party, or a pass holder within (or past) their 7 days.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Opens getmarquee.tv, signed in | Shows the library: Saved sets with Play on YouTube and Re-open, Drafts with Continue | `Library` |
| 2a | Taps Play on YouTube on a saved set | Hands off again; a two-part set opens the parts sheet | `Handoff sheet` / `Handoff · two parts` |
| 2b | Taps Re-open | Opens the set in the editor | `Editor · default` |
| 2c | Taps Continue on a draft | Opens the unfinished draft | `Editor · default` |
| 2d | Taps New set | Subscriber: landing, no wall. Pass holder who already used the pass: J7 with the subscription suggested | `Landing · empty` |
| 3 | First visit after paying, nothing saved yet | "Nothing saved yet. Every set you make from now on lands here." | `Library · empty` |

Step 2a gives a way to measure second plays for paying users in P0. The PRD defers that to P1, but the library is P0 for paid users, so the signal is available earlier.

**Pass holder after day 7 (PRD 16.1).** The set stays playable and copyable forever, and the editor turns read-only with one line: "Your pass covered 7 days of edits. Start a new set to change it." Not mocked.

**Open point.** PRD 16.1 says pass holders get a library with the free set moved in. The plan screen says "A library of saved sets (subscription)" and leaves the library off the pass card. The mockup has to change.

**Decided (PRD 18.1).** No pass-to-subscription credit in P0; listed under later options.

### J9. Change the set mid-party

**Who.** The host, 40 minutes in. The room is louder than expected, or a friend asks for Hiatus Kaiyote.

**Problem.** The set is playing in YouTube. Marquee can't touch that queue. Any edit has to go through a new handoff, and a new `watch_videos` URL starts from track 1. Without a fix, the room hears the opening song again.

| # | Person does | App does | Screen |
| --- | --- | --- | --- |
| 1 | Goes back to the Marquee tab | Shows the editor as they left it | `Editor · default` |
| 2 | Types "more upbeat from here" | Applies the change with a diff and Undo | `Editor · AI change with undo` |
| 3 | Taps Play on YouTube | Asks "Play from the start, or from a track?" and lists the tracks | Not mocked |
| 4 | Picks the track playing now | Builds the URL from that track onward | YouTube |
| 5 | Confirms in YouTube | YouTube replaces the queue on the TV, or asks whether to play now or add to queue. Phase 0 must check this while casting | YouTube |

"Play from here" is cheap because the URL is only a list of IDs. It is P0 in PRD 7.5, because "set it and forget it" breaks the moment a host wants one change.

### J10. Manage account and data

**Who.** Any paying user. The Account screen is P0 in PRD 7.7 and isn't mocked.

| Task | What happens |
| --- | --- |
| See plan | Plan name, price, renewal or pass end date |
| Cancel subscription | Through the hosted billing portal; ends at the period end; library stays readable and playable after that |
| Update card | Through the hosted billing portal |
| Sign out | Clears the session; local guest data is left alone |
| Delete my data | Confirms once, then deletes the user, entitlements, drafts and library. Keeps `CuratorRun` rows only with the user link removed, for evals |
| Connect or disconnect YouTube | P1, see J12 |

**Open point.** Refunds. If a pass buyer's generation fails and they give up, what happens? Write it down before the first charge, even if the answer is "email us".

### J11. When things go wrong

These states cut across every journey. The rule from PRD 13: a failure never removes the person's picks, pins or brief.

| Situation | What the person sees | What's kept | Mocked |
| --- | --- | --- | --- |
| Catalog or model unreachable during generation | "We couldn't reach the catalog. Nothing is lost." Try again, Change the brief | Brief | Yes, `Generating · error` |
| Generation passes 8 s | Progress steps keep moving; after a set ceiling, the error state above | Brief | Partly. The ceiling isn't defined |
| A constraint can't be fully met | "One thing to know: Only one COLORS performance fits this arc." That's fine, Loosen the arc | The set | Yes, `Editor · constraint warning` |
| The brief can't be served at all ("Norwegian black metal") | What the catalog has nearest, and an offer to try those. The request is logged as unmet | Brief | No |
| The prompt isn't about music | One line saying Marquee builds sets of live music, and the chips | Nothing to keep | No |
| Rate limit on generation | When they can try again | Brief | No |
| Refinement fails | The set is unchanged; the instruction stays in the box | Set and instruction | No |
| Reload or crash mid-edit | The editor comes back at the last revision | Everything | n/a |
| Handoff URL retired | Play on YouTube becomes Copy video list, with a line saying why | Set | No |
| Payment declined | Message on the payment form | Plan choice, held brief | No |
| Sign-in link expired or opened elsewhere | Option to send a new link; the held brief is on the server and survives (J7) | Brief | No |

## 4. P1 and internal journeys

These get a short outline now and full steps when they're scheduled.

### J12. Save to my YouTube (P1)

Starts in the handoff sheet once quota is approved. The person taps Save to my YouTube, sees the YouTube authorization screen (why we ask, the exact scope, disconnect anytime), goes through Google consent, and the app creates the playlist through the API. The sheet shows progress, then a link to the new playlist. A second tap on the same revision doesn't create a duplicate (idempotency key per revision). Disconnect lives in Account (J10). It only makes sense if the account system question in PRD 18 is answered: Google sign-in only, or app accounts with Google linked.

### J13. Audition before playing (P1)

In the editor, tapping a row's thumbnail plays it in the official IFrame player, with the rest of the set queued after it. It never counts as a handoff and never stands in for one. PRD 18 still asks whether this is wanted at all. For hosts, J1 doesn't need it. For enthusiasts in J2 it removes guesswork.

### J14. Ask why, tell us it's wrong (P1)

The explorer taps "Why this" on a row and gets one or two sentences tied to the brief ("Same Melbourne scene as Hiatus Kaiyote, and a slower set to open the second hour"). Feedback buttons ("too slow", "too loud") write tags back to the catalog. This is how performance-level energy data gets built without API-derived tags (PRD 12).

### J15. Review flagged catalog items (internal, P0)

Ingestion flags titles the rules can't parse and ambiguous performance-or-not calls, and samples 10% for spot checks (PRD 9.3). A catalog editor works through the queue: confirm or fix the artist, mark performance or not, approve as eligible. This needs at least a bare admin view or a documented SQL workflow. Neither appears in the screen inventory, and Phase 1's exit gate (under 2% misclassified in a 200-item audit) depends on it.

### J16. Respond to a broken handoff URL (internal, P0)

The daily automated check finds that `watch_videos` no longer turns into a queue. On-call confirms by hand on two surfaces, flips the feature flag so Play on YouTube becomes Copy video list (and Save to my YouTube if P1 is live), and updates the hint copy. Write this runbook before launch, because the failure is outside our control and could happen on a weekend.

## 5. Gaps found while mapping journeys

### 5.1 Screens and states with no mockup

| Needed by | Screen or state |
| --- | --- |
| J3 | Artist seed view, including the not-in-catalog and no-eligible-performance states |
| J2 | Replace with three alternatives |
| J2 | Visible controls for regenerate-unpinned and editing the title and description |
| J4 | "Let AI fill the rest" from the browser drawer |
| J6 | Landing for a returning guest with their free set and any hand-built sets |
| J7 | Plan screen holding a pending brief; "check your email"; payment declined; Apple Pay / Google Pay on the payment board |
| J8 | Pass ended, set read-only |
| J9 | Play from a track |
| J10 | Account (P0 in PRD 7.7) |
| J11 | Dead-end brief, non-music prompt, rate limit, Copy video list fallback |
| J5 | Hint for in-app browsers and for phones without the YouTube app |

### 5.2 Where the mockups disagree with the PRD

1. The Dinner Party chip prefills "Start mellow, get groovier as the night goes on." PRD 7.1 says copy never assumes a time of day. Suggested fix: "Start mellow, get groovier as it goes." Mockup to change.
2. PRD 7.1 lists duration presets (30 min, 1 h, 2 h, 3 h, custom). The mockups use a −30 min / +30 min stepper around 2 hours. Open in PRD 18.2.
3. Session pass library: PRD 16.1 includes one; the plan screen limits the library to the subscription. Mockup to change.
4. ~~The plan screen has no annual price.~~ Resolved: annual billing is deferred, so the mockup is right.
5. ~~PRD 5 says one button opens YouTube; the mockups insert the handoff sheet.~~ Resolved: sheet on first handoff only (PRD 18.1).
6. Phone editor says "Use Up and Down to move one" with no drag; PRD 7.4 specifies drag with a keyboard alternative. Open in PRD 18.2; record the answer in the design spec.
7. The payment board shows card entry only; PRD 16.1 adds Apple Pay and Google Pay. Mockup to change.

### 5.3 Decisions the journeys forced

All eleven were decided on Nov 8, 2026 and recorded in PRD 1.1 section 18.1, which is the authoritative list. In short:

1. **Free limit.** One draft is one playlist; refinements and regenerations inside it are free (25-run cap). Hand-built sets never count; the paywall gates model-backed runs (J4, J6).
2. **Paywall position.** After the brief is written, with the brief held on the server through sign-in and payment (J7).
3. **Guest data across a browser switch.** Drafts on the server; the sign-in link carries a claim code (J7).
4. **Sheet or straight to YouTube.** Sheet on the first handoff per browser, direct after that (J5).
5. **Typed duration against the control.** The text wins; the brief echo shows the result (J1).
6. **Pinned item against an explicit removal.** The newer instruction wins and the diff says so (J2).
7. **Manual picks.** Pinned for inclusion (J4).
8. **Session pass after day 7.** Playable forever, read-only editor (J8).
9. **Play from a track.** P0 (J9).
10. **Wallet payments** in P0 via hosted checkout; **annual billing** and **pass-to-subscription credit** deferred (J7, J8).
11. **Branded share links.** P0: a getmarquee.tv short link that redirects to the YouTube queue (J5).

## 6. Events these journeys need

Every journey above should be measurable with these events, keyed to the anonymous session (or user after payment). PRD 13 rules out tracking cookies in P0, so the session id lives in local storage alongside the draft.

| Event | Fired when | Journeys | Feeds (PRD 15) |
| --- | --- | --- | --- |
| `landing_viewed` | Landing renders; flags returning guest | J1, J6 | Activation, time to handoff |
| `brief_submitted` | Generate tapped; records entry type (chip, typed, artist, manual fill) | J1, J3, J4 | Visitors who submit a prompt |
| `generation_completed` / `generation_failed` | Curator run ends; latency, warnings | J1, J11 | Constraint warnings, speed |
| `item_pinned` / `item_removed` / `item_replaced` / `item_moved` | Editor actions | J2 | AI picks kept |
| `refinement_applied` / `refinement_undone` | Plain-language change applied or undone | J2, J9 | Quality |
| `regenerated_all` | Everything unpinned rebuilt | J2 | Regenerated from scratch |
| `handoff_opened` / `handoff_copied` / `handoff_shared` | `HandoffEvent` rows; include revision, part number and start index | J5, J6, J8, J9 | Handoff rate, handoff errors, second play |
| `share_link_opened` | Someone follows a getmarquee.tv short link | J5 | Second play (P0 proxy), reach |
| `paywall_viewed` / `plan_selected` | Plan screen shown, plan picked | J7 | Free to paid |
| `signin_completed` / `payment_completed` / `payment_failed` | Account and billing steps | J7 | Free to paid |
| `library_replayed` | Play on YouTube from the library or the returning-guest card | J6, J8 | Second play (P0 proxy) |

Time to handoff is `handoff_opened` minus `landing_viewed` for first-visit sessions. The day-7 beta survey stays the main second-play measure. `library_replayed` adds a measurement for people who come back through Marquee rather than through a playlist saved in YouTube.
