# 0006. Server-only database access, RLS as a backstop, Supabase CLI migrations

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 3, 5, 9.2, 9.4, 10; build plan T0, T2
- Sources, fetched 2026-11-08:
  - Supabase, [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
  - Supabase, [Managing environments](https://supabase.com/docs/guides/deployment/managing-environments)
  - Supabase, [Local development overview](https://supabase.com/docs/guides/local-development/overview)
  - Supabase, [Seeding your database](https://supabase.com/docs/guides/local-development/seeding-your-database)
  - Supabase, [Branching](https://supabase.com/docs/guides/deployment/branching)
  - Supabase, [Drizzle](https://supabase.com/docs/guides/database/drizzle)
  - Drizzle, [Migrations](https://orm.drizzle.team/docs/migrations), [drizzle-kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate), [Custom migrations](https://orm.drizzle.team/docs/kit-custom-migrations), [RLS](https://orm.drizzle.team/docs/rls), [Extensions](https://orm.drizzle.team/docs/extensions)

## Context

Two settled points and one open one.

Settled by architecture 9.2: all database access goes through server code with a server-only key, and the browser uses Supabase only for auth. Row-level security is on for every table with no policies, so a leaked anon key reads nothing.

Open: architecture 9.4 says migrations run through one tool and leaves the choice between Drizzle (`drizzle-kit`) and Supabase CLI migrations to this ADR. The build plan makes Drizzle the default unless the Supabase CLI docs show it fits the 9.4 environments better. Those environments are:

| Environment | Database | What it needs from the migration tool |
| --- | --- | --- |
| Local | Supabase CLI local stack, seeded from a fixture of about 300 performances | Rebuild schema and seed from the repo in one command |
| Preview | One shared Supabase staging project | Apply migrations to staging from CI |
| Production | Supabase production | Migrations run in CI before deploy |

The schema also needs more than tables and columns: the `pg_trgm` extension for typeahead, full-text indexes, check constraints (exactly one owner on `playlist_draft`), partial unique indexes (at most one free draft per owner), and RLS enabled with no policies.

## Decision

Schema migrations are plain SQL files in `supabase/migrations/`, created with `supabase migration new` and applied by the Supabase CLI in every environment. Drizzle Kit is not used for migrations.

| Environment | How migrations apply |
| --- | --- |
| Local | `supabase start`, then `supabase db reset` applies every file in `supabase/migrations` and then the seed |
| Staging | CI runs `supabase link --project-ref <staging>` and `supabase db push` on merge to `main` |
| Production | CI runs the same against production, before the Vercel production deploy |

The reasons, from the Supabase CLI docs, all come down to the local stack that 9.4 already chose:

1. **The local stack applies its own migrations folder and nothing else.** `supabase db reset` "applies all migration scripts under `supabase/migrations` directory", and seed files run "the first time you run `supabase start` and every time you run `supabase db reset`", "*after* all database migrations have been completed". With Drizzle, the schema would live in Drizzle's `drizzle/` folder and its `drizzle.__drizzle_migrations` table, while the CLI tracks `supabase_migrations.schema_migrations`. A reset would rebuild an empty database and run the seed before any Drizzle migration had applied. Local setup would need a second tool run between reset and seed, with two migration histories that can disagree.
2. **The CI path to staging and production is documented and is the one 9.4 describes.** Supabase's managing-environments guide gives GitHub Actions workflows that `supabase link` then `supabase db push` per environment, and recommends CI "rather than deploying from your local machine". `drizzle-kit migrate` can target any Postgres URL, but neither Supabase's Drizzle page nor Drizzle's docs describe a Supabase deploy flow.
3. **The schema's non-table parts are plain SQL either way.** Drizzle's extensions page says "there is no specific code to create an extension inside the Drizzle schema", and `drizzle-kit` "does not manage roles" unless configured. `pg_trgm`, RLS with no policies and the partial unique index would go into Drizzle custom SQL migrations anyway, which removes most of what Drizzle's schema-diffing adds.
4. **It keeps the upgrade path to per-PR databases open.** Supabase Branching builds a branch's schema "from the migrations in your repository". If the shared staging database becomes a problem, Branching works from the same files.

Drizzle's advantage is a TypeScript schema with inferred types. Typed rows can come from `supabase gen types typescript` instead, which Supabase's sample CI workflow checks for drift on every PR. Whether the server code queries through Drizzle ORM, Supabase's client or plain SQL is not decided here (see Consequences).

## Consequences

- Migrations live in `supabase/migrations/`, not `db/migrations/` as architecture 10 sketches. Card T2 owns both paths. Fixtures stay in `db/fixtures/`.
- A schema change is a new timestamped SQL file. Old files are never edited (CLAUDE.md).
- Every schema change on staging or production goes through `supabase db push` from CI. Dashboard edits to remote schema "bypass the migration history and will cause `db push` to fail". Supabase also says to run one `db push` at a time, so CI deploy jobs need a concurrency group.
- All preview deploys share one staging database, which carries `main`'s schema. A PR that adds a migration gets a preview against the old schema until it merges. Supabase Branching is the fix if that starts to hurt; it isn't adopted now.
- The staging project must start empty: per Supabase, a project already changed to match production "can't be used because the CLI would reapply these changes".
- The query layer is still open. Drizzle ORM can be used for queries against a schema these SQL migrations own, typed by `drizzle-kit pull` or hand-written, or `src/lib/db` can wrap the Supabase server client with generated types. Card T2 builds the db client and should record its choice. It must not add a second migration history.
- Generated SQL from `supabase db diff` can include `GRANT` and `REVOKE` statements "you didn't write". Hand-written migrations avoid that, and review should catch grants to `anon` or `authenticated` that would undo the RLS backstop.
