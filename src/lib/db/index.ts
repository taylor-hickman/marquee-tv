import "server-only";
import postgres from "postgres";

// The only way app code reaches Postgres (architecture 9.2, ADR 0006). It connects
// as the database owner over DATABASE_URL, so row-level security never applies here;
// the browser never gets this connection.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

function connect(url: string) {
  return postgres(url, {
    // Supabase's transaction-mode pooler does not keep named prepared statements.
    prepare: false,
    types: {
      // Catalog ids are int8; they stay far below 2^53, so read them as numbers.
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number) => String(value),
        parse: (value: string) => Number(value),
      },
    },
  });
}

// One pool per process; dev reloads reuse it instead of opening new connections.
const globalForDb = globalThis as { marqueeSql?: ReturnType<typeof connect> };

export const sql = (globalForDb.marqueeSql ??= connect(url));
