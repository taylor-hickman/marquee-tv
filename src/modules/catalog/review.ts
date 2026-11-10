import "server-only";
import { sql } from "@/lib/db";

// Review statuses that keep a row out of every catalog read until an editor
// clears it (architecture 8, 9.2). Pending stays visible: nothing sets a row to
// accepted on ingest, so requiring it would hide every new upload.
export const HELD = ["flagged", "rejected"];

// Performance `p` is held by neither its own review nor any billed artist's.
// Read-time, so an editor's decision takes effect without touching `eligible`.
export const cleared = () => sql`
  p.review_status <> all(${HELD}::text[])
  and not exists (
    select 1 from performance_artist ra
    join artist ar on ar.id = ra.artist_id
    where ra.performance_id = p.id and ar.review_status = any(${HELD}::text[]))`;
