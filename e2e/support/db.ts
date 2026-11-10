// Playwright's global setup (build plan 6.2): empties every table on the local
// stack and loads the catalog fixture, so each run starts from the same rows.
// The stack must already hold this checkout's migrations: pnpm db:reset.

import { execFileSync } from "node:child_process";
import postgres from "postgres";

export default async function resetDatabase() {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  const sql = postgres(status.DB_URL, { onnotice: () => {} });
  try {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`;
    await sql`truncate ${sql(tables.map((t) => t.tablename))} restart identity cascade`;
    // The truncate empties app_flag too; put back the flag a migration seeds.
    await sql.file("supabase/migrations/20261109230000_seed_handoff_mode.sql");
  } finally {
    await sql.end();
  }
  execFileSync("node", ["scripts/seed/seed.mts"], { stdio: "pipe" });
}
