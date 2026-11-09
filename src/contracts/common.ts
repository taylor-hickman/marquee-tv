import { z } from "zod";

// Naming: shapes stored as jsonb or read and written by the model (brief, revision
// items, ops, curator output, warnings) keep the snake_case keys architecture 5.2 and
// 6.2 give them. HTTP envelopes are camelCase, after 9.1's `baseRevision`.

// Catalog ids are bigint in Postgres, read as numbers (src/lib/db).
const catalogId = z.number().int().positive();
export const performanceId = catalogId;
export const artistId = catalogId;
export const seriesId = catalogId;
export const publisherId = catalogId;
export type PerformanceId = z.infer<typeof performanceId>;
export type ArtistId = z.infer<typeof artistId>;

export const draftId = z.uuid();
export const guestId = z.uuid();
export const userId = z.uuid();
export const runId = z.uuid();
export type DraftId = z.infer<typeof draftId>;
export type GuestId = z.infer<typeof guestId>;
export type UserId = z.infer<typeof userId>;

// playlist_revision.number starts at 1. A draft with no revision yet has null.
export const revisionNumber = z.number().int().positive();
export const baseRevision = revisionNumber.nullable();

export const videoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

// Short code behind getmarquee.tv/s/<code> (architecture 5.2).
export const shareCode = z.string().regex(/^[A-Za-z0-9]{4,16}$/);

export const energy = z.number().int().min(1).max(5);

export const plan = z.enum(["session_pass", "subscription"]);

// Who a request acts for: a guest by token, or a signed-in user (architecture 4).
export const owner = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("guest"), guestId }),
  z.object({ kind: z.literal("user"), userId }),
]);
export type Owner = z.infer<typeof owner>;

// What the editor, browser and library show for one performance (PRD 7.3, 7.4).
// Title, duration and date come from performance_yt_cache, which expires
// (architecture 5.3) while revisions are kept forever, so they are null once the
// cache row is gone. The title is for display only: it never reaches the model
// (CLAUDE.md rule 5).
export const performanceCard = z.object({
  id: performanceId,
  videoId,
  title: z.string().min(1).nullable(),
  artists: z.array(z.object({ id: artistId, name: z.string().min(1) })).min(1),
  publisher: z.object({ id: publisherId, name: z.string().min(1) }),
  series: z.object({ id: seriesId, name: z.string().min(1) }),
  durationS: z.number().int().positive().nullable(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type PerformanceCard = z.infer<typeof performanceCard>;
