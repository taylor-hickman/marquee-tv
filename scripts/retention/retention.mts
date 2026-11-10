// The nightly retention job (architecture 4, PRD 7.6): deletes unclaimed guest
// drafts 30 days after last activity, the later of the draft's last change and
// the guest's last visit. Revisions and share links go with the draft;
// curator_run rows stay for evals with draft_id nulled by their foreign key.
//
//   DATABASE_URL=... node scripts/retention/retention.mts

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// The transaction pooler keeps no named prepared statements.
const sql = postgres(url, { prepare: false, max: 1 });
try {
  const deleted = await sql`
    delete from playlist_draft d
    using guest g
    where d.owner_guest_id = g.id
      and greatest(d.updated_at, g.last_seen_at) < now() - interval '30 days'`;
  console.log(`Deleted ${deleted.count} unclaimed guest drafts.`);
} finally {
  await sql.end();
}
