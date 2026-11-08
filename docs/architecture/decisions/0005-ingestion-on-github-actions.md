# 0005. Scheduled jobs run on GitHub Actions

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 3, 8, 9.3, 9.4, 12 row 9; PRD 9.3, 11

## Context

The catalog needs scheduled jobs: nightly ingest, classify and profile, a weekly refresh, a nightly expiry, a weekly audit sample, and a daily handoff check. PRD 1.0 assumed a managed scheduler. Serverless functions on Vercel have time limits that a full ingest or refresh can outrun. The jobs also need the same catalog module and LLM adapter as the app.

## Decision

The worker is a TypeScript entry point in the same repo, `scripts/ingest`, that imports the `catalog` module and the LLM adapter. GitHub Actions runs each job on its own cron schedule. Secrets live in GitHub Actions environment settings. The `check-handoff` job runs there too, with Playwright in the same Action if `watch_videos` needs a real browser.

A failed job or a failed `check-handoff` raises an alert. Architecture 8 says the on-call channel is chosen here. The architecture doc doesn't name one, so this ADR doesn't choose it: card I2 sets up alerting and picks the channel.

## Consequences

- No function time limits, a log per run, and no extra vendor.
- Actions cron is best-effort: a run can start minutes late. Nothing in the catalog needs better than that.
- The worker shares code with the app, so a module change that breaks ingestion fails the same `pnpm check`.
- If the jobs outgrow Actions, the same script moves to any container scheduler.
