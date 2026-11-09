// Runs against the local Supabase stack after `pnpm db:reset && pnpm seed`.
// Skipped when no stack is running, except in CI, where a missing stack fails.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Stack = {
  DB_URL: string;
  API_URL: string;
  PUBLISHABLE_KEY: string;
  ANON_KEY: string;
};

function localStack(): Stack | null {
  try {
    const out = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(out);
  } catch (error) {
    if (process.env.CI) throw error;
    return null;
  }
}

const stack = localStack();

describe.skipIf(!stack)("database", () => {
  let sql: typeof import("@/lib/db").sql;
  let tables: string[];
  const userId = randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = stack!.DB_URL;
    ({ sql } = await import("@/lib/db"));
    tables = (
      await sql<{ tablename: string }[]>`
        select tablename from pg_tables where schemaname = 'public' order by tablename`
    ).map((r) => r.tablename);

    // Put a row in every table pnpm seed leaves empty, so "anon reads zero rows" means something.
    await sql.begin(async (tx) => {
      await tx`insert into auth.users (id, email, aud, role)
               values (${userId}, ${`${userId}@example.test`}, 'authenticated', 'authenticated')`;
      await tx`insert into app_user (id, email) values (${userId}, ${`${userId}@example.test`})`;
      const [guest] = await tx`
        insert into guest (token_hash, cohort)
        values (sha256(convert_to(${userId}, 'utf8')), 'pass_first') returning id`;
      const [entitlement] = await tx`
        insert into entitlement (user_id, kind, status) values (${userId}, 'subscription', 'active') returning id`;
      const [draft] = await tx`
        insert into playlist_draft (owner_guest_id, creation_method, entitlement_id)
        values (${guest.id}, 'prompt', ${entitlement.id}) returning id`;
      const [run] =
        await tx`insert into curator_run (draft_id, kind) values (${draft.id}, 'generate') returning id`;
      await tx`insert into playlist_revision (draft_id, number, trigger, curator_run_id)
               values (${draft.id}, 1, 'generate', ${run.id})`;
      await tx`insert into share_link (code, draft_id, revision) values (${userId}, ${draft.id}, 1)`;
      await tx`insert into handoff_event (draft_id, revision, type) values (${draft.id}, 1, 'open')`;
      await tx`insert into event (name, guest_id, draft_id) values (${userId}, ${guest.id}, ${draft.id})`;
      await tx`insert into app_flag (key, value) values (${userId}, 'test')`;
      await tx`insert into performance_tag (performance_id, kind, value, source)
               select min(id), 'mood', ${userId}, 'editor' from performance`;
    });
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.begin(async (tx) => {
      await tx`delete from curator_run where draft_id in (
                 select d.id from playlist_draft d join guest g on g.id = d.owner_guest_id
                 where g.token_hash = sha256(convert_to(${userId}, 'utf8')))`;
      await tx`delete from handoff_event where draft_id in (
                 select draft_id from share_link where code = ${userId})`;
      await tx`delete from event where name = ${userId}`;
      await tx`delete from guest where token_hash = sha256(convert_to(${userId}, 'utf8'))`;
      await tx`delete from auth.users where id = ${userId}`;
      await tx`delete from app_flag where key = ${userId}`;
      await tx`delete from performance_tag where value = ${userId}`;
    });
    await sql.end();
  });

  test("seed leaves 300 performances, each with a YouTube cache row", async () => {
    const [counts] = await sql`
      select (select count(*) from performance) as performances,
             (select count(*) from performance p join performance_yt_cache c on c.performance_id = p.id) as cached`;
    expect(counts).toEqual({ performances: 300, cached: 300 });
  });

  test("every table has row-level security on and no policies", async () => {
    const rows = await sql`
      select c.relname as table, c.relrowsecurity as rls,
             (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(row, row.table).toMatchObject({ rls: true, policies: 0 });
  });

  test("the server client sees a row in every table", async () => {
    for (const table of tables) {
      const rows = await sql`select 1 from ${sql(table)} limit 1`;
      expect(rows, table).toHaveLength(1);
    }
  });

  test.each(["PUBLISHABLE_KEY", "ANON_KEY"] as const)(
    "the %s reads zero rows from every table",
    async (key) => {
      const anon = createClient(stack!.API_URL, stack![key], {
        auth: { persistSession: false },
      });
      for (const table of tables) {
        const { data, error } = await anon.from(table).select("*");
        if (error)
          expect(error.code, `${table}: ${error.message}`).toBe("42501");
        else expect(data, table).toEqual([]);
      }
    },
  );
});
