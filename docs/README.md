# Planning docs

| Doc | Path | Status |
| --- | --- | --- |
| Product requirements (PRD) | [product/prd.md](product/prd.md) | v1.0 |
| User journeys | `product/user-journeys.md` | In progress |
| Design spec | `design/design.md` | In progress |
| Design mockups | [design/mockups.html](design/mockups.html) | Draft (open in a browser) |
| Architecture | `architecture/architecture.md` | In progress |
| Architecture decision records | [architecture/decisions/](architecture/decisions/) | None yet |

## Layout

- `product/`: what we're building and for whom (PRD, user journeys).
- `design/`: how it looks and behaves (design spec, mockups, exported assets).
- `architecture/`: how it's built. Record significant technical choices as ADRs in `decisions/`, named `NNNN-short-title.md` (e.g. `0001-url-handoff-export.md`).

The PRD is the source of truth for scope. When another doc disagrees with it, update one of them rather than letting them drift.
