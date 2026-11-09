# Marquee TV

An AI music curator for the world's best live sessions. Tell it the mood, an artist or a duration, and it builds an ordered playlist of live performances (NPR Tiny Desk, KEXP, COLORS) and hands it to YouTube to play on any screen.

Planning docs live in [`docs/`](docs/README.md). Start with the [PRD](docs/product/prd.md).

## Phase 0: de-risk

| Deliverable | Where |
| --- | --- |
| URL handoff tests per surface | [docs/architecture/handoff-tests.md](docs/architecture/handoff-tests.md), probe in [scripts/probe/handoff-page/](scripts/probe/handoff-page/) |
| One publisher channel ingested end to end | [docs/architecture/ingest-run.md](docs/architecture/ingest-run.md), code in [scripts/probe/ingest/](scripts/probe/ingest/) |
| YouTube compliance memo | [docs/architecture/compliance-memo.md](docs/architecture/compliance-memo.md) |
| Quota extension application | [docs/architecture/quota-application.md](docs/architecture/quota-application.md) |
