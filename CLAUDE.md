# Marquee TV

An AI curator that builds an ordered playlist of live performances from a verified catalog and hands it to YouTube by URL. One Next.js app, one Postgres database, one scheduled worker.

Guidelines adapted from the Karpathy-inspired CLAUDE.md (forrestchang/andrej-karpathy-skills). They bias toward caution over speed. For trivial edits, use judgment.

## Where the truth lives

- `docs/product/prd.md` decides scope. When any other doc or this file disagrees with it, the PRD wins. Record the disagreement as a row in `docs/architecture/architecture.md` section 12.
- `docs/architecture/architecture.md` decides how: data model (5), curator pipeline (6), flows (7), API (9.1), repo layout (10).
- `docs/product/user-journeys.md` decides the states a screen passes through and the events it emits (section 6).
- `docs/design/mockups.html` is the visual reference until a design spec exists.
- `docs/architecture/decisions/` holds ADRs. A choice listed there is settled.
- `docs/build-plan.md` holds the task cards. Your task is one card.

## 1. Think before coding

Read your card, then the PRD and architecture sections it names, before writing anything.

- State your assumptions in the handback. Local choices (a file name, a test shape, a loop structure) you make and record.
- A choice that changes a table, a migration, an API route, or a schema under `src/contracts/` affects other lanes. Stop and report it as a question instead of deciding.
- If two readings of the card exist, name both and say which you took.
- If a simpler approach than the one the docs describe exists, say so in the handback and build what the docs say unless the card gives you latitude.

## 2. Simplicity first

Minimum code that meets the card. Nothing speculative.

- Build what the card asks. P1 items in the PRD stay unbuilt; architecture section 11 lists the hooks that already exist for them.
- One use, no abstraction. Two uses, still probably no abstraction.
- Error handling only for failures architecture section 9.5 names or a test exercises.
- If 200 lines could be 50, rewrite.

Ask: would a senior engineer call this overcomplicated? Then simplify.

## 3. Surgical changes

Write only inside the paths your card owns. Read anything.

- Leave adjacent code, comments and formatting as they are. Match the existing style.
- A schema change is a new numbered migration file, never an edit to an old one.
- Remove imports and functions your change made unused. Mention unrelated dead code in the handback and leave it.
- Every changed line traces to your card.

## 4. Goal-driven execution

Your card's "Done when" is the goal. Loop until it holds.

- Write the test first when the card names a behaviour: invented IDs dropped, pins restored, `402` on the second model-backed draft.
- `pnpm check` (format, typecheck, lint, unit and integration tests) green before the handback, plus `pnpm test:e2e` when your card has Playwright specs. If it is red for a reason outside your paths, say so and stop.
- Tests follow `docs/build-plan.md` section 6: where each kind lives, what it may touch, which shared helpers to use.
- The handback lists: assumptions made, departures from the docs, anything in the card you did not finish and why.

## Rules the code enforces, never the prompt

These come from PRD section 4 and architecture section 2. A model call is never trusted to hold them.

1. Every performance ID in curator output comes from that run's candidate set.
2. Pins, removals and exclusions survive every regeneration.
3. Entitlement checks sit on generate, refine, regenerate and fill-the-rest. Draft creation, manual edits, replace, play and copy are always allowed.
4. Play on YouTube calls `window.open` synchronously in the click handler. No `await` before it.
5. Titles and descriptions from the YouTube API never reach the model at request time.

## UI copy

Brutalist and minimal. Controls explain themselves; there is no helper text. Copy never names a time of day (PRD 7.1): "set" and "party", never "tonight".

## Delivery

One task, one branch, one PR. Title the PR with the card ID and name. Commit messages say what changed and why in one line.

Card review: the required `card-review` check stays red until you act. Once `check`, `e2e` and `migrations` pass on a PR that changes anything outside `docs/`, run the card review in `docs/build-plan.md` 4.1. Every push, a fix or a rebase, needs a new one. Then `hydra done`.
