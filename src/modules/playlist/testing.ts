// Drafts for route handler tests. Import @/test/db first, as for any
// integration test.

import type { PerformanceId, RevisionItem } from "@/contracts";
import { sql } from "@/test/db";
import * as factories from "@/test/factories";

// Eligible seeded performances that have an artist, so their cards parse.
export async function catalogIds(n: number): Promise<PerformanceId[]> {
  const rows = await sql<{ id: PerformanceId }[]>`
    select p.id from performance p
    where p.eligible
      and exists (select 1 from performance_artist pa where pa.performance_id = p.id)
    order by p.id limit ${n}`;
  return rows.map((row) => row.id);
}

export const aiItem = (id: PerformanceId): RevisionItem => ({
  performance_id: id,
  pinned: "none",
  source: "ai",
});

// A draft at revision 1 holding `ids` as AI picks. Overrides go to the draft row.
export async function draftAt(
  ids: PerformanceId[],
  draft: Record<string, unknown> = {},
) {
  const row = await factories.playlistDraft({
    creation_method: "typed",
    current_revision: 1,
    ...draft,
  });
  await factories.playlistRevision({
    draft_id: row.id,
    number: 1,
    items: sql.json(ids.map(aiItem)),
  });
  return row.id as string;
}
