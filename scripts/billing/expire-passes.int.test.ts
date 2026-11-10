import { sql } from "@/test/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import * as factories from "@/test/factories";

const DAY = 86_400_000;

const statusOf = async (id: string) =>
  (await sql`select status from playlist_draft where id = ${id}`)[0].status;

async function passDraft(periodEnd: Date) {
  const user = await factories.appUser();
  const pass = await factories.entitlement({
    user_id: user.id,
    kind: "session_pass",
    period_end: periodEnd,
  });
  return factories.playlistDraft({
    owner_user_id: user.id,
    entitlement_id: pass.id,
  });
}

// The nightly job runs `pnpm expire-passes` against each environment's
// DATABASE_URL; here it runs the same command against this test's database.
test("the job makes lapsed pass drafts read_only and leaves running ones open", async () => {
  const lapsed = await passDraft(new Date(Date.now() - DAY));
  const running = await passDraft(new Date(Date.now() + DAY));

  const { stdout } = await promisify(execFile)("pnpm", [
    "--silent",
    "expire-passes",
  ]);

  expect(stdout).toMatch(/^expired \d+ pass drafts?\n$/);
  expect(await statusOf(lapsed.id)).toBe("read_only");
  expect(await statusOf(running.id)).toBe("active");
}, 30_000);
