import "server-only";
import { randomInt } from "node:crypto";
import type { DraftId, HandoffEvent } from "@/contracts";
import { sql } from "@/lib/db";
import { getDraft } from "./drafts";
import type { CreateShareLink, RecordHandoff, ResolveShareLink } from "./types";

// Share links and handoff rows (architecture 7.2).

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH = 8;

const newCode = () =>
  Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(62)]).join("");

// One code per (draft, revision, start index). The draft's current revision
// only, as every write takes `baseRevision`; a read-only draft can still be
// shared, since copy is always allowed.
export const createShareLink: CreateShareLink = async (
  owner,
  draftId,
  { baseRevision, startIndex },
) => {
  const [draft] = await sql<
    { current_revision: number | null; length: number | null }[]
  >`
    select d.current_revision, jsonb_array_length(r.items) as length
    from playlist_draft d
    left join playlist_revision r
      on r.draft_id = d.id and r.number = d.current_revision
    where d.id = ${draftId}
      and (d.owner_guest_id = ${owner.kind === "guest" ? owner.guestId : null}
        or d.owner_user_id = ${owner.kind === "user" ? owner.userId : null})`;
  if (!draft) return { ok: false, error: { error: "not_found" } };
  if (draft.current_revision !== baseRevision) {
    const current = await getDraft(owner, draftId);
    return current.ok
      ? { ok: false, error: { error: "conflict", current: current.value } }
      : current;
  }
  if (startIndex >= (draft.length ?? 0)) {
    return {
      ok: false,
      error: {
        error: "invalid_request",
        issues: ["startIndex: past the last track"],
      },
    };
  }

  // A concurrent request for the same triple makes the insert do nothing, and
  // the select finds its row; a clash on the code itself finds none and retries.
  for (;;) {
    const [inserted] = await sql<{ code: string }[]>`
      insert into share_link (code, draft_id, revision, start_index)
      values (${newCode()}, ${draftId}, ${baseRevision}, ${startIndex})
      on conflict do nothing
      returning code`;
    const [row] = inserted
      ? [inserted]
      : await sql<{ code: string }[]>`
          select code from share_link
          where draft_id = ${draftId} and revision = ${baseRevision}
            and start_index = ${startIndex}`;
    if (row) {
      return {
        ok: true,
        value: { code: row.code, url: `https://getmarquee.tv/s/${row.code}` },
      };
    }
  }
};

// Slices by position in the revision before dropping performances that no
// longer exist, so the start index means the same track it did when shared.
export const resolveShareLink: ResolveShareLink = async (code) => {
  const [link] = await sql<
    {
      draftId: DraftId;
      revision: number;
      startIndex: number;
      videoIds: string[];
    }[]
  >`
    select s.draft_id as "draftId", s.revision, s.start_index as "startIndex",
      coalesce((
        select array_agg(p.video_id order by e.ord)
        from jsonb_array_elements(r.items) with ordinality e(item, ord)
        join performance p on p.id = (e.item->>'performance_id')::bigint
        where e.ord > s.start_index
      ), '{}') as "videoIds"
    from share_link s
    join playlist_revision r
      on r.draft_id = s.draft_id and r.number = s.revision
    where s.code = ${code}`;
  return link ?? null;
};

const handoffType = {
  handoff_opened: "open",
  handoff_copied: "copy",
  handoff_shared: "share",
} as const satisfies Record<HandoffEvent["name"], string>;

// A draft that doesn't exist (any more) is left off the row, as in events.write.
export const recordHandoff: RecordHandoff = async (event) => {
  await sql`
    insert into handoff_event
      (draft_id, revision, type, part, start_index, surface)
    values (
      (select id from playlist_draft where id = ${event.draftId}),
      ${event.revision}, ${handoffType[event.name]}, ${event.part},
      ${event.startIndex}, ${event.surface ?? null}
    )`;
};
