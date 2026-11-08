# Planning docs

| Doc | Path | Status |
| --- | --- | --- |
| Product requirements (PRD) | [product/prd.md](product/prd.md) | v1.1 (decisions in §18) |
| User journeys | [product/user-journeys.md](product/user-journeys.md) | Draft v0.2 |
| Design spec | `design/design.md` | Not started |
| Design mockups | [design/mockups.html](design/mockups.html) | Draft (open in a browser); fixes listed in journeys §5.1–5.2 |
| Architecture | [architecture/architecture.md](architecture/architecture.md) | Draft v0.2 |
| Architecture decision records | [architecture/decisions/](architecture/decisions/) | None yet; backlog in architecture §13 |
| Build plan | [build-plan.md](build-plan.md) | Draft v0.1; task cards for agents, status table in §4 |

## Layout

- `product/`: what we're building and for whom (PRD, user journeys).
- `design/`: how it looks and behaves (design spec, mockups, exported assets).
- `architecture/`: how it's built. Record significant technical choices as ADRs in `decisions/`, named `NNNN-short-title.md` (e.g. `0001-url-handoff-export.md`).

Agents building the app read the root `CLAUDE.md` first, then their card in the build plan.

The PRD is the source of truth for scope. When another doc disagrees with it, update one of them rather than letting them drift.
