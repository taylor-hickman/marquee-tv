// Analytics events (architecture 3, 9.3).
import { sql } from "@/lib/db";
import type { Write } from "./types";

export type * from "./types";

// A draft or user that doesn't exist (yet, or any more) is left off the row
// rather than failing the write.
export const write: Write = async (name, { owner, draftId, props }) => {
  await sql`
    insert into event (name, guest_id, user_id, draft_id, props)
    values (
      ${name},
      ${owner?.kind === "guest" ? owner.guestId : null},
      (select id from app_user where id = ${owner?.kind === "user" ? owner.userId : null}),
      (select id from playlist_draft where id = ${draftId ?? null}),
      ${sql.json(props ?? {})}
    )`;
};
