# YouTube API quota extension application

Nov 8, 2026 · Phase 0 deliverable (PRD 10.2, 14; build plan R3) · Status: drafted, not submitted

This is the ready-to-paste text for every field of the YouTube API Services Audit and Quota Extension Form, written from the PRD and `compliance-memo.md`. It has not been submitted. The next section says what blocks submission.

Sources, fetched Nov 8, 2026:

- The form: https://support.google.com/youtube/contact/yt_api_form. Sections 1 to 5 were read. Section 6 ("Other Supporting Materials") and the submit step were cut off by the fetch tool and are unread.
- The guide: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits. It gives no review time, only "A member of YouTube's API Services team will contact you as soon as possible."
- Unit costs: https://developers.google.com/youtube/v3/determine_quota_cost.

## Why it can't be submitted in Phase 0

PRD 14 puts "quota extension application submitted" in Phase 0 to start the clock early. The form makes that impossible, because an extension request is a compliance audit of a working app. It requires:

| Form requirement | When it exists |
| --- | --- |
| "Primary Access URL", and "Is your API Client publicly accessible?" | Phase 3, when getmarquee.tv serves the app |
| "Privacy Policy URL", required, plus "Privacy Policy Screenshots (Showing YouTube sections, Google Privacy Policy link, deletion policies, etc.)" | D3 writes the pages, after D2 |
| "Homepage Screenshot — showing where Privacy Policy link is located with YouTube branding visible" | E2 and E9, plus the YouTube attribution the memo adds to E3 and E7 |
| "Terms of Service Documentation" | D3 |
| "OAuth Flow Screenshots", required when the app uses Google sign-in for YouTube access: consent screen, scopes, revocation | P1 Save to my YouTube |
| For playlist management: "either (a) a complete, working upload script … or (b) an end-to-end screencast … demonstrating the full upload flow through to the final uploaded video live on YouTube" | P1 Save to my YouTube |
| A Google Cloud project number | R4 (not done) |

So the earliest honest submission is when the P0 app is live with its privacy policy and terms, and the P1 export runs at least on staging so it can be filmed. Two ways to get there sooner, for Taylor to choose:

1. Build only the P1 export's OAuth and `playlists.insert` path on staging right after D3, film it, and submit then. Approval can run in parallel with the rest of Phase 3.
2. Submit at Phase 3 exit and accept that P1 waits on approval. Nothing in P0 needs extra quota: ingestion uses under 1% of the default 10,000 units a day (below).

**Decision, Nov 8, 2026: option 1.** Taylor chose it. The backlog item `marquee-r3-quota-extension-application` now carries it and waits on D3.

PRD 14's Phase 0 row should change from "submitted" to "drafted". This doc doesn't edit the PRD.

## Quota arithmetic

Unit costs from the quota cost page: `channels.list`, `playlistItems.list` and `videos.list` cost 1 unit each, and `playlists.insert` and `playlistItems.insert` cost 50 each. The default is 10,000 units a day for these endpoints.

**P0, ingestion only.** Three channels at full depth plus three thin ones. Nightly `ingest:new`: one `playlistItems.list` page per series plus one `videos.list` call, so about 12 units. Weekly `refresh`: about 50 units for 2,500 videos (PRD 9.3). The first full backfill of a large channel is a few hundred units, once. Daily use stays under 100 units, under 1% of the default. **P0 needs no extension.**

**P1, Save to my YouTube.** One export is 1 `playlists.insert` (50) plus one `playlistItems.insert` per video (50 each), plus about 1 unit to read back and verify. A typical two-hour set is 15 to 40 items (architecture 5.2); at 20 items an export costs 1,051 units. The default quota covers 9 exports a day.

| Assumption | Value | Basis |
| --- | --- | --- |
| Playlists created a month at public launch | 1,000 | PRD 16.2 plans for "1,000 free playlists a month" |
| Share of playlists saved to YouTube | 30% | Estimate. One tap in YouTube does the same thing for free, so most people won't need the API path |
| Exports a day, average | 10 | 1,000 × 30% ÷ 30 |
| Exports a day, weekend peak | 30 | 3× average: the beachhead user is hosting a party |
| Units a day at peak | 31,530 | 30 × 1,051 |
| Ingestion | 100 | Above |
| Requested | **50,000 units a day** | Peak plus 50% for growth over the six months after approval |

## Field-by-field text

`[Taylor]` marks a value only Taylor can supply.

### Section 1: Request type

- **Select the reason for your request:** Complete a compliance audit to request for additional quota

### Section 2: Organization and contact information

- **Are you applying:** `[Taylor]`: "As an individual user" unless a company is formed first
- **Your Full Legal Name:** `[Taylor]`
- **Your Organization's Legal Name:** `[Taylor]`, or "self" if applying as an individual
- **Parent Company Name (if applicable):** self
- **Your Organization's Primary Website:** https://getmarquee.tv
- **Legal address (Country, Street Address, City, State/Province, Postal Code):** `[Taylor]`
- **Category:** Media and Entertainment
- **Organization Size / Type:** Independent Developer/Sole Proprietor (or Startup, fewer than 10 employees, if incorporated)
- **Primary Contact Information, Name and Email:** `[Taylor]`
- **Primary Technical Contact:** Same as Primary Contact
- **Primary Business Contact:** Same as Primary Contact

### Section 3: Business model and Google contacts

**Describe your organization's work as it relates to YouTube** (100 to 5,000 characters):

> Marquee TV (getmarquee.tv) is an AI music curator for live-session performances published on YouTube by music publishers such as NPR Music (Tiny Desk Concerts), KEXP and COLORS. A user describes an occasion ("friends over for dinner, two hours, mellow then groovy"), names artists, or picks performances by hand. Marquee TV builds an ordered playlist of real performances with a deliberate energy arc over the chosen duration, and the user adjusts it in plain language.
>
> Marquee TV does not play, host or download video. Every playlist is handed to YouTube: today by opening a youtube.com link that plays the videos as a queue in the YouTube app or website, where the user watches, casts to a TV, and sees YouTube's ads, attribution and controls unchanged. The value we add is curation across publishers and sequencing over a set duration, which YouTube's per-video search and autoplay don't offer. Playback, watch time and the audience stay on YouTube, and every play is a view on the publisher's own channel.
>
> We use the YouTube Data API in two ways:
>
> 1. Catalog upkeep, with an API key. We page each publisher's uploads playlist with playlistItems.list and fetch duration, publish date and availability with videos.list, 50 videos per call. API data (titles, durations, dates, availability) is kept in a separate cache table, refreshed weekly, and deleted after 30 days if not refreshed (Developer Policies III.E.4.d). Thumbnails are shown from YouTube's image servers and never stored. We do not use search.list.
>
> 2. Save to my YouTube (the reason for this request). A signed-in user can save a finished playlist to their own YouTube account with one button. This uses Google OAuth with the youtube scope, granted only when the user asks for it, then playlists.insert and one playlistItems.insert per video. Each export is idempotent per playlist version so a retry never duplicates a playlist. Tokens are stored server-side only and revoked when the user disconnects. A 20-video playlist costs about 1,051 units, so the default quota covers about nine saves a day.
>
> Users pay for our curation (a $2.99 session pass or a $4.99 monthly subscription for AI-generated playlists after the first free one). They never pay to watch: playback is free on YouTube, opening and copying playlists is always free, and we sell no ads.

**Who is your target audience?** General Public

**How does your API Client monetize or generate revenue?** Freemium (free version with paid upgrades); Recurring Subscriptions (users pay monthly/yearly)

**Do you currently have a designated Google Partner Manager or YouTube Partner Manager?** No, I do not have a Google representative

**How did you first learn about the YouTube Data API?** Google Developer Documentation

**Content Owner ID(s):** leave blank

**Google Ads Customer ID(s):** leave blank

### Section 4: API client overview and access information

- **API Client Name:** Marquee TV
- **Does this API Client name contain the word "YouTube"?** No, the name does not contain "YouTube"
- **Primary Access URL:** https://getmarquee.tv
- **Privacy Policy URL:** https://getmarquee.tv/privacy (D3)
- **Terms of Service URL:** https://getmarquee.tv/terms (D3)
- **Is your API Client publicly accessible?** Yes (once Phase 3 ships)
- **Demo Account Username or Email / Password:** `[Taylor]`: a subscriber test account with sample playlists and a connected test YouTube account, created after D2. The form rejects placeholder credentials.
- **Login URL:** https://getmarquee.tv/library
- **Special Instructions for Access:**

  > No account is needed to try the core flow: open getmarquee.tv, tap a mood, and tap Play on YouTube. To see Save to my YouTube, sign in with the demo account, open any playlist in the Library and tap Save to my YouTube; the consent screen asks for the youtube scope, and the saved playlist appears in the connected YouTube account. Disconnect is under Account.

- **Acknowledgment (demo credentials):** tick

### Section 5: Use cases and quota extension details

- **How many project numbers are you adding?** 1
- **Google Cloud Project Number:** `[Taylor]` from R4. One project for the app (Developer Policies III.D.1.c)
- **Use Case Category:** Video Uploading & Account Management ("managing playlists in bulk" is the closest listed use); Others: "AI curation of public live-session videos into playlists that open on YouTube"
- **Does this API Client require users to sign in with their Google Account (OAuth 2.0)?** Yes (for Save to my YouTube only; browsing, generating and playing need no Google sign-in)
- **Derived metrics and data storage acknowledgment:** leave unticked. Marquee TV shows no metrics and stores no statistics.
- **Expected API Usage Volume:** 1,000 to 10,000 requests per day (about 700 requests at peak: 30 exports of 22 calls each, plus ingestion. Units are higher than requests because inserts cost 50)
- **Required evidence:** privacy policy screenshots, homepage screenshot with the privacy link and YouTube attribution visible, and the terms of service as a PDF. All JPEG or PNG except the terms. Take them from the live site.
- **Conditional evidence:** (a) OAuth flow screenshots: consent screen, the youtube scope, and the Disconnect control. (b) For Video Uploading & Account Management: a screencast from tapping Save to my YouTube through to the playlist visible in YouTube.
- **Endpoints:** youtube.channels.list, youtube.playlistItems.list, youtube.videos.list, youtube.playlists.insert, youtube.playlistItems.insert, youtube.playlists.list
- **What is the total quota you are requesting?** Above Default quota
- **Total Per Day Quota:** 50,000
- **Detailed Justification:**

  > The extra quota is for Save to my YouTube: one playlists.insert (50 units) plus one playlistItems.insert per video (50 units each). A typical playlist has 20 videos, so a save costs about 1,051 units and the default 10,000 units allows nine saves a day across all users. We expect about 1,000 playlists a month at launch with about 30% saved to YouTube, which is 10 saves a day on average and 30 on weekend evenings, when most people use the product to host. 30 saves is about 31,500 units; we ask for 50,000 to cover growth over the next six months. Catalog upkeep (playlistItems.list and videos.list, 50 videos per call) uses under 100 units a day. We do not use search.list or videos.insert.

- **search.list and videos.insert quota:** none requested

### Section 6: Other supporting materials

Not read (the fetch was cut off). Expect a field for the screencast link; use the Save to my YouTube screencast above.

## Before submitting

1. R4 creates the Google Cloud project; put its number in Section 5.
2. D3's privacy policy covers what DP III.A.2 requires (see `compliance-memo.md`): that the app uses YouTube API Services, a link to Google's Privacy Policy, how to revoke access at https://security.google.com/settings/security/permissions, and deletion within 7 days.
3. The homepage shows the privacy link and YouTube attribution.
4. Open the live form and check Section 6 and anything that changed since Nov 8, 2026.
5. Record the submission date and case ID here.
