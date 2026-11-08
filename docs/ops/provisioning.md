# Provisioning

Nov 8, 2026 · Build plan card R4 · Reads architecture 9.2, 9.4

Marquee TV runs on six outside accounts. `scripts/provision/wizard.sh` sets them up and writes every secret straight into Vercel and GitHub Actions, the only places secrets live (architecture 9.2). Nothing is written to disk. `scripts/provision/verify.sh` checks the result.

```sh
scripts/provision/wizard.sh                 # every stage, in order
scripts/provision/wizard.sh --only stripe   # one stage
scripts/provision/verify.sh                 # what's missing, and the stage that sets it
```

Every stage is safe to re-run: it looks for what exists before it creates anything.

## Environments

| Environment | Vercel | GitHub Actions | Supabase project | Stripe |
| --- | --- | --- | --- | --- |
| Preview | Preview | `preview` | `marquee-staging` | test mode |
| Production | Production | `production` | `marquee-production` | test mode until launch |
| Local | none | none | Supabase CLI local stack | none |

Local development runs on the seeded local stack (architecture 9.4) and needs none of these values.

## What each stage does

| Stage | How | Creates | Sets |
| --- | --- | --- | --- |
| `clis` | Installs missing CLIs with Homebrew or npm, runs each login | Sessions for `gh`, `vercel`, `supabase`, `gcloud` | none |
| `github` | `gh api` | Actions environments `preview` and `production` | none |
| `vercel` | `vercel project create`, `vercel git connect` | Project `marquee-tv`, deploying from `taylor-hickman/marquee-tv` | none |
| `supabase` | `supabase projects create`, `supabase projects api-keys`, Management API for the pooler string | `marquee-staging`, `marquee-production` in `us-east-1` | Supabase URL, publishable and secret keys, `DATABASE_URL` |
| `google-cloud` | `gcloud projects create`, `gcloud services enable`, `gcloud services api-keys create` | Project "Marquee TV", YouTube Data API on, key `marquee-ingest` limited to that API | `YOUTUBE_API_KEY` |
| `google-oauth` | By hand in Google Cloud console, then the Supabase Management API | Consent screen, web OAuth client "Supabase Auth" | Google provider on in both Supabase projects |
| `stripe` | You paste the test secret key; `stripe prices create`, `stripe webhook_endpoints create` | Prices `marquee_session_pass` ($2.99 one-off) and `marquee_monthly` ($4.99 a month); a webhook endpoint per environment for the four events in architecture 7.3 | Stripe key, both price IDs, webhook secrets |
| `sentry` | You paste a token; `sentry-cli info` checks it; Sentry API creates the project | Project `marquee-tv` (Next.js) | DSN, org, project, auth token |
| `llm` | By hand in the Anthropic console | Workspaces `marquee-preview` (low spend cap) and `marquee-production` | `ANTHROPIC_API_KEY`, one per environment |
| `verify` | `verify.sh` | none | none |

`.env.example` lists every variable. The `# @stage targets` line above each group says which stage sets it and whether it belongs in Vercel, GitHub Actions or both. `verify.sh` reads those lines.

## Steps no CLI covers

These are the steps the wizard walks you through by hand:

- **Logins.** `vercel login`, `supabase login`, `gcloud auth login` and `gh auth login` open a browser.
- **Supabase access token.** The pooler connection string and the Google provider settings are only reachable through the Management API, which needs a personal access token. The wizard asks for it once per run and keeps it in memory.
- **Google consent screen and OAuth client.** No CLI creates a standard OAuth client.
- **Stripe secret key.** The Stripe CLI's own login key is restricted and can't stand in for the app's key.
- **Sentry token.** `sentry-cli` can't create projects or tokens, so the wizard creates the project through the Sentry API with your token.
- **Anthropic workspaces and keys.**
- **A lost database password.** Supabase shows the password only at creation. If `DATABASE_URL` goes missing later, the `supabase` stage opens the reset page and takes the new password.

## Still to do

Status on Nov 8, 2026, when this card was built:

- [x] GitHub Actions environments `preview` and `production` exist.
- [x] `vercel`, `stripe`, `sentry-cli` and `gcloud` are installed on Taylor's machine. `gh` and `supabase` were already logged in.
- [ ] Log in to `vercel` and `gcloud`, then run the remaining stages: `scripts/provision/wizard.sh`. The `github` stage runs again harmlessly.
- [ ] **Preview Stripe webhook.** Vercel previews change URL per PR and sit behind Vercel's login wall, so Stripe can't reach them. The `stripe` stage asks for one stable preview URL (for example `staging.getmarquee.tv` assigned to a branch in Vercel) and skips the preview webhook without one. Until then, `verify.sh` reports `STRIPE_WEBHOOK_SECRET` missing for preview.
- [ ] **Domain.** The production webhook points at `https://getmarquee.tv/api/webhooks/stripe`. Add `getmarquee.tv` to the Vercel project before the first real checkout.
- [ ] **Google consent screen.** Stays in Testing until `/privacy` and `/terms` ship (card D3); then publish it. Basic profile scopes need no Google review.
- [ ] **Stripe live mode.** Production uses test-mode keys until launch. Going live needs account activation in the Stripe dashboard, a live secret key, live prices and a live webhook: re-run the `stripe` stage with a live key and the `sk_test_` check removed.

## Choices made here

- **Variables exist only where they're read.** The app on Vercel gets Supabase, Stripe, Sentry and the LLM key. GitHub Actions runs migrations and the ingestion worker (architecture 8, 9.4), so it gets `DATABASE_URL`, `YOUTUBE_API_KEY` and the LLM key. The YouTube key stays out of Vercel because nothing in the request path calls the YouTube API (architecture 2).
- **Supabase's new key names.** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` replace the legacy anon and service-role keys. The publishable key runs as the `anon` role, so "the anon key reads nothing" (architecture 9.2, card T2) still holds.
- **`DATABASE_URL` is the transaction pooler** (port 6543), because Vercel and GitHub Actions can't reach Supabase's IPv6-only direct host. If ADR 0006's migration tool needs session mode, it uses the same host on port 5432.
- **`ANTHROPIC_API_KEY`** assumes ADR 0008 keeps its default. If T0 picks another provider, rename the variable in `.env.example` and the `llm` stage.
- **All GitHub values are secrets**, public ones included, so `verify.sh` has one place to look.
