import { databaseUrl, sql } from "@/test/db";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import * as factories from "@/test/factories";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const retention = () =>
  execFileSync("node", ["scripts/retention/retention.mts"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });

const draftExists = async (id: string) =>
  (await sql`select 1 from playlist_draft where id = ${id}`).length > 0;

describe("retention", () => {
  test("deletes a guest's draft after 31 days idle and keeps its curator runs", async () => {
    const guest = await factories.guest({ last_seen_at: daysAgo(31) });
    const draft = await factories.playlistDraft({
      owner_guest_id: guest.id,
      updated_at: daysAgo(31),
    });
    const run = await factories.curatorRun({
      draft_id: draft.id,
      output_ids: [1, 2, 3],
    });
    await factories.playlistRevision({
      draft_id: draft.id,
      curator_run_id: run.id,
    });
    await factories.shareLink({ draft_id: draft.id });

    retention();

    expect(await draftExists(draft.id)).toBe(false);
    expect(
      await sql`select 1 from playlist_revision where draft_id = ${draft.id}`,
    ).toEqual([]);
    const [kept] = await sql`select * from curator_run where id = ${run.id}`;
    expect(kept).toMatchObject({ draft_id: null, output_ids: [1, 2, 3] });
  });

  test("keeps recent guest drafts, returning guests' drafts and claimed drafts", async () => {
    const idle = await factories.guest({ last_seen_at: daysAgo(29) });
    const recent = await factories.playlistDraft({
      owner_guest_id: idle.id,
      updated_at: daysAgo(29),
    });
    const returning = await factories.guest({ last_seen_at: daysAgo(2) });
    const visited = await factories.playlistDraft({
      owner_guest_id: returning.id,
      updated_at: daysAgo(60),
    });
    const user = await factories.appUser();
    const claimed = await factories.playlistDraft({
      owner_user_id: user.id,
      updated_at: daysAgo(400),
    });

    retention();

    for (const draft of [recent, visited, claimed]) {
      expect(await draftExists(draft.id)).toBe(true);
    }
  });
});
