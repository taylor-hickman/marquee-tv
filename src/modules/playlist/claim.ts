import "server-only";
import type { LibraryResponse } from "@/contracts";
import { sql } from "@/lib/db";
import { consumeClaimCode } from "@/modules/billing";
import type { ClaimGuestDrafts, ListLibrary } from "./types";

// Claiming and the library (architecture 4, 7.3 step 3).

// Moves every draft the code's guest owns to the user, and the guest's beta
// cohort with them, in one transaction. A user who already has a free draft
// keeps it, and the guest's comes across as paid-for, since a user has at most
// one. A user who claimed before keeps their first cohort, so the plan screen's
// default doesn't flip between visits.
export const claimGuestDrafts: ClaimGuestDrafts = async (claimCode, userId) => {
  const guestId = await consumeClaimCode(claimCode);
  if (!guestId) return { ok: false, error: { error: "not_found" } };
  return sql.begin(async (tx) => {
    const moved = await tx`
      update playlist_draft
      set owner_user_id = ${userId}, owner_guest_id = null,
        free = free and not exists (
          select 1 from playlist_draft
          where owner_user_id = ${userId} and free)
      where owner_guest_id = ${guestId}`;
    await tx`
      update app_user
      set cohort = coalesce(app_user.cohort, guest.cohort)
      from guest
      where app_user.id = ${userId} and guest.id = ${guestId}`;
    return { ok: true, value: { claimed: moved.count } };
  });
};

type LibraryRow = Omit<LibraryResponse["drafts"][number], "updatedAt"> & {
  updatedAt: Date;
};

// The user's drafts, most recently revised first. A draft's time is its
// current revision's, or its own until it has one.
export const listLibrary: ListLibrary = async (userId) => {
  const rows = await sql<LibraryRow[]>`
    select d.id, d.title, d.status, d.free, d.current_revision as revision,
      coalesce(i.runtime_s, 0) as "runtimeS",
      coalesce(i.video_ids, '{}') as "videoIds",
      coalesce(r.created_at, d.updated_at) as "updatedAt"
    from playlist_draft d
    left join playlist_revision r
      on r.draft_id = d.id and r.number = d.current_revision
    left join lateral (
      select array_agg(p.video_id order by e.ord) as video_ids,
        sum(coalesce(c.duration_s, 0))::int as runtime_s
      from jsonb_array_elements(r.items) with ordinality e(item, ord)
      join performance p on p.id = (e.item->>'performance_id')::bigint
      left join performance_yt_cache c on c.performance_id = p.id
    ) i on true
    where d.owner_user_id = ${userId}
    order by "updatedAt" desc, d.id`;
  return {
    drafts: rows.map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
};
