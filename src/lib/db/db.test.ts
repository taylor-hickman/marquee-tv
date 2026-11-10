import { sql as testSql } from "@/test/db";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { sql } from "@/lib/db";

vi.mock("server-only", () => ({}));

describe("database", () => {
  let tables: string[];
  const userId = randomUUID();

  beforeAll(async () => {
    tables = (
      await testSql<{ tablename: string }[]>`
        select tablename from pg_tables where schemaname = 'public' order by tablename`
    ).map((r) => r.tablename);

    // Put a row in every table pnpm seed leaves empty, so "anon reads zero rows" means something.
    await testSql.begin(async (tx) => {
      await tx`insert into auth.users (id, email, aud, role)
               values (${userId}, ${`${userId}@example.test`}, 'authenticated', 'authenticated')`;
      await tx`insert into app_user (id, email) values (${userId}, ${`${userId}@example.test`})`;
      const [guest] = await tx`
        insert into guest (token_hash, cohort)
        values (sha256(convert_to(${userId}, 'utf8')), 'pass_first') returning id`;
      await tx`insert into claim_code (code_hash, guest_id)
               values (sha256(convert_to(${userId}, 'utf8')), ${guest.id})`;
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

  test("seed leaves 300 performances, each with a YouTube cache row", async () => {
    const [counts] = await testSql`
      select (select count(*) from performance) as performances,
             (select count(*) from performance p join performance_yt_cache c on c.performance_id = p.id) as cached`;
    expect(counts).toEqual({ performances: 300, cached: 300 });
  });

  test("every table has row-level security on and no policies", async () => {
    const rows = await testSql`
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

  // The publishable and anon keys both reach Postgres as the anon role, which
  // PostgREST assumes with set local role.
  test("the anon role reads zero rows from every table", async () => {
    for (const table of tables) {
      const result = await testSql
        .begin(async (tx) => {
          await tx`set local role anon`;
          return tx`select * from ${tx(table)}`;
        })
        .catch((error: { code: string; message: string }) => error);
      if ("code" in result)
        expect(result.code, `${table}: ${result.message}`).toBe("42501");
      else expect(result, table).toEqual([]);
    }
  });
});
