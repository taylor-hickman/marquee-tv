// The integration-test database (build plan 6.1). Importing this module gives
// the test file a fresh database of its own and points DATABASE_URL at it, so
// import it before anything that imports @/lib/db.
//
// Each Vitest worker clones its database from a template that holds the
// migrations in this checkout and the seeded catalog. The template is built
// once per hash of those inputs and shared; worker databases are named by
// worktree and worker, so parallel files and parallel worktrees on one local
// stack never share rows.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll } from "vitest";

const root = new URL("../../", import.meta.url);
const migrationsDir = new URL("supabase/migrations/", root);
const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => ({
    file,
    sql: readFileSync(new URL(file, migrationsDir), "utf8"),
  }));

const hash = (...parts: string[]) =>
  createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 12);

const templateName = `mq_tpl_${hash(
  ...migrations.flatMap((m) => [m.file, m.sql]),
  readFileSync(new URL("db/fixtures/catalog.json", root), "utf8"),
  readFileSync(new URL("scripts/seed/seed.mts", root), "utf8"),
)}`;
const workerName = `mq_test_${hash(fileURLToPath(root)).slice(0, 8)}_${process.env.VITEST_POOL_ID ?? "0"}`;

function stack(): { DB_URL: string } {
  try {
    return JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error(
      "Integration tests need the local stack: pnpm db:start && pnpm seed",
    );
  }
}

const stackUrl = stack().DB_URL;
const urlFor = (database: string) => {
  const url = new URL(stackUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

// The schemas Supabase gives its own database that the migrations build on.
function supabaseSchemas() {
  const dump = execFileSync(
    "supabase",
    ["db", "dump", "--local", "-s", "auth"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  // Drop pg_dump's psql commands (\restrict), and the owners and grants: the
  // test database belongs to the stack's postgres role, which can't assign
  // Supabase's internal roles.
  const auth = dump.replace(
    /^(\\.*|ALTER .* OWNER TO .*|ALTER DEFAULT PRIVILEGES .*|GRANT .*|REVOKE .*)$/gm,
    "",
  );
  // The dump empties search_path for the session; the migrations need it back.
  return `create schema extensions;\n${auth}\nreset all;`;
}

async function buildTemplate(admin: postgres.Sql) {
  const building = `${templateName}_build`;
  await admin.unsafe(`drop database if exists ${building} with (force)`);
  await admin.unsafe(`create database ${building}`);
  const db = postgres(urlFor(building), { max: 1, onnotice: () => {} });
  try {
    await db.unsafe(supabaseSchemas());
    for (const migration of migrations) await db.unsafe(migration.sql);
  } finally {
    await db.end();
  }
  execFileSync("node", ["scripts/seed/seed.mts", building], {
    cwd: root,
    stdio: "pipe",
  });
  // The rename publishes the template only once it is complete.
  await admin.unsafe(`alter database ${building} rename to ${templateName}`);
}

const admin = postgres(stackUrl, { max: 1, onnotice: () => {} });
try {
  const exists = async (name: string) =>
    (await admin`select 1 from pg_database where datname = ${name}`).length > 0;
  if (!(await exists(templateName))) {
    // Workers and worktrees race to build the same template; one does.
    await admin`select pg_advisory_lock(hashtext(${templateName}))`;
    try {
      if (!(await exists(templateName))) await buildTemplate(admin);
    } finally {
      await admin`select pg_advisory_unlock(hashtext(${templateName}))`;
    }
  }
  await admin.unsafe(`drop database if exists ${workerName} with (force)`);
  await admin.unsafe(`create database ${workerName} template ${templateName}`);
} finally {
  await admin.end();
}

export const databaseUrl = urlFor(workerName);
process.env.DATABASE_URL = databaseUrl;

// The test's own connection, typed like @/lib/db's, for arranging rows and
// asserting on them.
export const sql = postgres(databaseUrl, {
  onnotice: () => {},
  types: {
    bigint: {
      to: 20,
      from: [20],
      serialize: (value: number) => String(value),
      parse: (value: string) => Number(value),
    },
  },
});
afterAll(() => sql.end());
