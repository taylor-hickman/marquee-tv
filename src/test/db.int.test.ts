import { databaseUrl, sql } from "./db";
import { expect, test } from "vitest";

test("each worker gets its own database, cloned from the seeded template", async () => {
  const [row] = await sql`
    select current_database() as name,
           (select count(*) from performance)::int as performances,
           (select count(*) from performance_yt_cache)::int as cached`;
  expect(row.name).toMatch(/^mq_test_[0-9a-f]{8}_\d+$/);
  expect(process.env.DATABASE_URL).toBe(databaseUrl);
  expect(row).toMatchObject({ performances: 300, cached: 300 });
});
