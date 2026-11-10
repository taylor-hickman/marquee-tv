import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { mintClaimCode } from "@/modules/billing";
import * as factories from "@/test/factories";
import { claimGuestDrafts } from "./claim";

vi.mock("server-only", () => ({}));

const draftsOf = (column: "owner_guest_id" | "owner_user_id", id: string) =>
  sql`select id, free from playlist_draft where ${sql(column)} = ${id}
      order by id`;

describe("claimGuestDrafts", () => {
  test("moves three drafts and the cohort from the guest to the user", async () => {
    const guest = await factories.guest({ cohort: "sub_first" });
    const user = await factories.appUser();
    const drafts = await Promise.all([
      factories.playlistDraft({ owner_guest_id: guest.id, free: true }),
      factories.playlistDraft({ owner_guest_id: guest.id }),
      factories.playlistDraft({ owner_guest_id: guest.id }),
    ]);
    const other = await factories.playlistDraft();

    const code = await mintClaimCode(guest.id);
    expect(await claimGuestDrafts(code, user.id)).toEqual({
      ok: true,
      value: { claimed: 3 },
    });

    expect(await draftsOf("owner_guest_id", guest.id)).toEqual([]);
    const claimed = await draftsOf("owner_user_id", user.id);
    expect(claimed.map((d) => d.id)).toEqual(drafts.map((d) => d.id).sort());
    expect(claimed.filter((d) => d.free)).toHaveLength(1);
    const [{ cohort }] =
      await sql`select cohort from app_user where id = ${user.id}`;
    expect(cohort).toBe("sub_first");
    const [untouched] =
      await sql`select owner_guest_id from playlist_draft where id = ${other.id}`;
    expect(untouched.owner_guest_id).toBe(other.owner_guest_id);
  });

  test("a second claim with the same code fails and moves nothing", async () => {
    const guest = await factories.guest();
    const user = await factories.appUser();
    const intruder = await factories.appUser();
    await factories.playlistDraft({ owner_guest_id: guest.id });
    const code = await mintClaimCode(guest.id);

    expect((await claimGuestDrafts(code, user.id)).ok).toBe(true);
    // A draft the guest makes after the claim stays theirs.
    const later = await factories.playlistDraft({ owner_guest_id: guest.id });
    expect(await claimGuestDrafts(code, intruder.id)).toEqual({
      ok: false,
      error: { error: "not_found" },
    });
    expect(await draftsOf("owner_user_id", intruder.id)).toEqual([]);
    expect(await draftsOf("owner_guest_id", guest.id)).toEqual([
      { id: later.id, free: false },
    ]);
    const [{ cohort }] =
      await sql`select cohort from app_user where id = ${intruder.id}`;
    expect(cohort).toBeNull();
  });

  test("a user's existing free draft and first cohort win", async () => {
    const user = await factories.appUser({ cohort: "pass_first" });
    const own = await factories.playlistDraft({
      owner_user_id: user.id,
      free: true,
    });
    const guest = await factories.guest({ cohort: "sub_first" });
    const incoming = await factories.playlistDraft({
      owner_guest_id: guest.id,
      free: true,
    });

    const result = await claimGuestDrafts(
      await mintClaimCode(guest.id),
      user.id,
    );
    expect(result).toEqual({ ok: true, value: { claimed: 1 } });
    expect(await draftsOf("owner_user_id", user.id)).toEqual(
      [
        { id: own.id, free: true },
        { id: incoming.id, free: false },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    const [{ cohort }] =
      await sql`select cohort from app_user where id = ${user.id}`;
    expect(cohort).toBe("pass_first");
  });
});
