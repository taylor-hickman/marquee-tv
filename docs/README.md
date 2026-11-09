# Planning docs

| Doc | Path | Status |
| --- | --- | --- |
| Product requirements (PRD) | [product/prd.md](product/prd.md) | v1.1 (decisions in §18) |
| User journeys | [product/user-journeys.md](product/user-journeys.md) | Draft v0.2 |
| Design spec | `design/design.md` | Not started |
| Design mockups | [design/mockups.html](design/mockups.html) | Draft (open in a browser); fixes listed in journeys §5.1–5.2 |
| Architecture | [architecture/architecture.md](architecture/architecture.md) | Draft v0.2 |
| Architecture decision records | [architecture/decisions/](architecture/decisions/) | Accepted: [0001](architecture/decisions/0001-url-handoff-export.md) URL handoff export, [0002](architecture/decisions/0002-server-side-guest-drafts.md) server-side guest drafts, [0003](architecture/decisions/0003-curator-precomputed-artist-profiles.md) precomputed artist profiles, [0004](architecture/decisions/0004-revisions-as-snapshots.md) revisions as snapshots, [0005](architecture/decisions/0005-ingestion-on-github-actions.md) ingestion on GitHub Actions, [0006](architecture/decisions/0006-data-access-and-migrations.md) data access and migrations, [0007](architecture/decisions/0007-auth-and-payments.md) auth and payments, [0008](architecture/decisions/0008-llm-provider-and-models.md) LLM provider and models, [0009](architecture/decisions/0009-first-party-event-store.md) first-party event store, [0010](architecture/decisions/0010-paywall-on-model-runs.md) paywall on model runs, [0011](architecture/decisions/0011-branded-share-links.md) branded share links |
| Build plan | [build-plan.md](build-plan.md) | Draft v0.2; task cards for agents, status table in §4, testing and CI in §6 |

## Layout

- `product/`: what we're building and for whom (PRD, user journeys).
- `design/`: how it looks and behaves (design spec, mockups, exported assets).
- `architecture/`: how it's built. Record significant technical choices as ADRs in `decisions/`, named `NNNN-short-title.md` (e.g. `0001-url-handoff-export.md`).

Agents building the app read the root `CLAUDE.md` first, then their card in the build plan.

The PRD is the source of truth for scope. When another doc disagrees with it, update one of them rather than letting them drift.
