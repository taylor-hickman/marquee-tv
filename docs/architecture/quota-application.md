# YouTube API quota extension application

Nov 8, 2026 · drafted in Phase 0 (PRD 10.2, 14; build plan R3) · Nov 10, 2026 · submitted

## Submission

- **Submitted:** Nov 10, 2026, through https://support.google.com/youtube/contact/yt_api_form, signed in as ops@getmarquee.tv, for Google Cloud project `marquee-tv-71b10a` (number 568998183607).
- **Case ID:** pending. The form's confirmation page ("Thank you for submitting the YouTube API Services Form") shows none; it arrives by email to ops@getmarquee.tv.
- **Screencast:** none was submitted. The take filmed on staging ended on the wrong YouTube account (see below), and Taylor chose to submit without a second take. The form accepts "a complete, working upload script" in place of a screencast, so the conditional-evidence upload is a PDF of the OAuth flow screenshots plus the full Save to my YouTube source.
- **Requested:** 50,000 units a day, above the default 10,000.

Google gives no review time: "A member of YouTube's API Services team will contact you as soon as possible" (https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).

## Why it was submitted in Phase 3, not Phase 0

PRD 14 put "quota extension application submitted" in Phase 0. The form made that impossible: an extension request is a compliance audit of a working app, and it asks for the live URL, the privacy policy and terms, OAuth screenshots and a demonstration of the playlist flow. On Nov 8 Taylor chose to build only Save to my YouTube on staging, behind `handoff_mode = api`, and submit from there, so approval runs in parallel with the rest of Phase 3. PRD 14's Phase 0 row now says "drafted".

## What was filed, and what to know about it

- **The privacy policy linked from the form is production's, which predates Save to my YouTube.** Until this card's PR merges, getmarquee.tv/privacy says "We do not ask for access to your YouTube account", and the uploaded privacy screenshot shows that text. Taylor chose to submit first and ship the updated policy (the "Save to my YouTube" section of `docs/legal/privacy.md`) with the merge. If a reviewer asks, point them at the live page after the merge.
- **The homepage screenshot** shows the footer's "Not affiliated with YouTube or any publisher." beside the Privacy link. Taylor judged that enough for "YouTube branding visible".
- **Save to my YouTube is not public yet.** It runs on staging only, with the OAuth consent screen in Testing mode, and production's `handoff_mode` stays `url`. The form's description says so.
- **Endpoints declared:** `playlistItems.list` and `videos.list` (ingestion) and `playlists.insert` and `playlistItems.insert` (export). The draft also named `channels.list` and `playlists.list`; no shipped code calls them, so they were left off.
- **The staging run.** On Nov 10 the export ran twice for taylorhickman1@gmail.com: a private playlist "Tiny Desk, slow to loud" with the set's 5 videos, then Disconnect revoked the grant. "Open in YouTube" landed on "This account is not yet eligible to use YouTube" because the browser's first Google account was ops@getmarquee.tv, a Workspace account without YouTube. That is what spoiled the screencast. A real user with one Google account doesn't hit it.

## Quota arithmetic

Unit costs from https://developers.google.com/youtube/v3/determine_quota_cost: `playlistItems.list` and `videos.list` cost 1 unit each, `playlists.insert` and `playlistItems.insert` 50 each. The default is 10,000 units a day.

**Ingestion.** Nightly `ingest:new` is one `playlistItems.list` page per series plus one `videos.list` call, about 12 units. Weekly `refresh` is about 50 units for 2,500 videos (PRD 9.3). Daily use stays under 100 units.

**Save to my YouTube.** One export is 1 `playlists.insert` (50) plus one `playlistItems.insert` per video (50 each). A typical two-hour set is 15 to 40 items (architecture 5.2); at 20 items an export costs 1,050 units, so the default quota covers 9 exports a day.

| Assumption | Value | Basis |
| --- | --- | --- |
| Playlists created a month at public launch | 1,000 | PRD 16.2 plans for "1,000 free playlists a month" |
| Share of playlists saved to YouTube | 30% | Estimate. Play on YouTube does the same thing for free |
| Exports a day, average | 10 | 1,000 × 30% ÷ 30 |
| Exports a day, weekend peak | 30 | 3× average: the beachhead user is hosting a party |
| Units a day at peak | 31,500 | 30 × 1,050 |
| Ingestion | 100 | Above |
| Requested | **50,000 units a day** | Peak plus 50% for growth over the six months after approval |

## Field by field, as submitted

### Section 1: Request type

- Complete a compliance audit to request for additional quota

### Section 2: Organization and contact information

- Applying as an individual user. Taylor's legal name and address went into the form and are not kept here.
- Organization legal name and parent company: self
- Primary website: https://getmarquee.tv
- Category: Media and Entertainment
- Organization size / type: Independent Developer/Sole Proprietor
- Primary, technical and business contact: Taylor Hickman, ops@getmarquee.tv

### Section 3: Business model and Google contacts

**Describe your organization's work as it relates to YouTube:**

> Marquee TV (getmarquee.tv) is an AI music curator for live-session performances published on YouTube by music publishers such as NPR Music (Tiny Desk Concerts), KEXP and COLORS. A user describes an occasion ("friends over for dinner, two hours, mellow then groovy"), names artists, or picks performances by hand. Marquee TV builds an ordered playlist of real performances with a deliberate energy arc over the chosen duration, and the user adjusts it in plain language.
>
> Marquee TV does not play, host or download video. Every playlist is handed to YouTube: by opening a youtube.com link that plays the videos as a queue in the YouTube app or website, where the user watches, casts to a TV, and sees YouTube's ads, attribution and controls unchanged. The value we add is curation across publishers and sequencing over a set duration, which YouTube's per-video search and autoplay don't offer. Playback, watch time and the audience stay on YouTube, and every play is a view on the publisher's own channel.
>
> We use the YouTube Data API in two ways:
>
> 1. Catalog upkeep, with an API key. We page each publisher's uploads playlist with playlistItems.list and fetch duration, publish date and availability with videos.list, 50 videos per call. API data (titles, durations, dates, availability) is kept in a separate cache table, refreshed weekly, and deleted after 30 days if not refreshed (Developer Policies III.E.4.d). Thumbnails are shown from YouTube's image servers and never stored. We do not use search.list.
>
> 2. Save to my YouTube (the reason for this request). A signed-in user can save a finished playlist to their own YouTube account with one button. This uses Google OAuth with the youtube scope, asked for only when the user chooses it, then one playlists.insert (a private playlist) and one playlistItems.insert per video. Each export is idempotent per playlist version, so a retry never duplicates a playlist. Refresh tokens are stored server-side only, encrypted, and revoked at Google when the user disconnects or deletes their data. The feature is built and running on our staging environment (see the attached flow and source) and turns on for users once quota allows it: a 20-video playlist costs about 1,051 units, so the default quota covers about nine saves a day across all users.
>
> Users pay for our curation (a $2.99 session pass or a $4.99 monthly subscription for AI-generated playlists after the first free one). They never pay to watch: playback is free on YouTube, opening and copying playlists is always free, and we sell no ads.

- Target audience: General Public
- Monetization: Recurring Subscriptions; Freemium
- Google representative: No
- How we learned about the API: Google Developer Documentation
- Content Owner IDs, Google Ads Customer IDs: blank

### Section 4: API client overview and access information

- API Client Name: Marquee TV; the name does not contain "YouTube"
- Primary Access URL: https://getmarquee.tv
- Privacy Policy URL: https://getmarquee.tv/privacy
- Terms of Service URL: https://getmarquee.tv/terms
- Publicly accessible: Yes. The form asks for demo-account credentials only when the answer is No.

### Section 5: Use cases and quota extension details

- Project numbers: 1, project 568998183607
- Use case: Video Uploading & Account Management
- Users sign in with their Google Account (OAuth 2.0): Yes
- Expected API usage volume: 1,000 to 10,000 requests per day
- Required evidence: `marquee-tv-privacy-policy-page.png` (production /privacy), `marquee-tv-homepage.png`, `marquee-tv-terms-of-service.pdf`
- Conditional evidence: `marquee-tv-oauth-flow-and-upload-script.pdf`: the Marquee TV authorization screen naming the scope, Google's account step, the private playlist live in the user's YouTube account, and Account's Disconnect, followed by the full source of `src/modules/youtube/`, the four YouTube routes and the `youtube_export` migration. Google's permission screen is missing: the browser extension couldn't capture it during the run.
- Endpoints: youtube.playlistItems.list, youtube.videos.list, youtube.playlists.insert, youtube.playlistItems.insert
- Total quota: Above Default; 50,000 a day
- Detailed justification:

  > The extra quota is for Save to my YouTube: one playlists.insert (50 units) plus one playlistItems.insert per video (50 units each). A typical playlist has 20 videos, so a save costs about 1,050 units and the default 10,000 units allows nine saves a day across all users. We expect about 1,000 playlists a month at launch with about 30% saved to YouTube, which is 10 saves a day on average and 30 on weekend evenings, when most people use the product to host. 30 saves is about 31,500 units; we ask for 50,000 to cover growth over the next six months. Catalog upkeep (playlistItems.list and videos.list, 50 videos per call) uses under 100 units a day. We do not use search.list or videos.insert.

### Section 6: Additional evidence and documentation

This section was unread in the Nov 8 draft. On the live form it requires an architecture diagram and a user flow diagram (JPEG, PNG or PDF, at least 1280×720, one file under 10 MB each), plus optional other supporting materials.

- Architecture diagram: `marquee-tv-architecture.png`, the app, database, worker and Google, with every YouTube Data API call marked
- User flow diagram: `marquee-tv-user-flow.png`, from a set to Play on YouTube or Save to my YouTube, through consent, the save and Disconnect
- Other supporting materials: none

### Section 7: Attestations

All eight ticked with Taylor's yes: YouTube API Services Terms of Service, Google Privacy Policy, Developer Policies, termination, the demo-account waiver, accuracy, processing of the submission (including automated/LLM-based systems), and support-call recording.

## Next

1. Record the case ID here when the email arrives.
2. Before Save to my YouTube goes public: Google OAuth verification of the consent screen for the sensitive `youtube` scope, and production's `handoff_mode` set to `api` once quota is granted.
