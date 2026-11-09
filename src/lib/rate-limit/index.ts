import "server-only";
import { createHash } from "node:crypto";
import type { ErrorBody, Owner } from "@/contracts";
import { sql } from "@/lib/db";

// Rate limits (architecture 9.2). Model-backed runs and new guests are counted
// from curator_run and guest rows in Postgres; the plain per-IP limit on
// /api/events, /s/:code and catalog search is a counter in this process.

// 9.2 starts at 10 model-backed runs an hour. A guest or user can't exceed their
// IP's limit without changing IP, so they get the same number.
export const RUNS_PER_HOUR = { ip: 10, guest: 10, user: 10 } as const;
export const GUESTS_PER_IP_PER_HOUR = 10;
export const PLAIN_PER_IP_PER_MINUTE = 60;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

type RateLimited = Extract<ErrorBody, { error: "rate_limited" }>;

const rateLimited = (retryAfterMs: number): RateLimited => ({
  error: "rate_limited",
  retryAfterS: Math.max(1, Math.ceil(retryAfterMs / 1000)),
});

// Vercel sets x-forwarded-for to the client address, replacing what the client
// sent. The address itself is never stored.
export function ipHash(request: Request): Buffer {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return createHash("sha256")
    .update(ip || "unknown")
    .digest();
}

// Null when the run may go ahead. Each array_agg picks the limit-th newest run
// in the window: when one exists the limit is reached, and it frees up an hour
// after that run.
export async function limitRuns(
  ip: Buffer,
  owner: Owner | null,
  now: Date,
): Promise<RateLimited | null> {
  const guestId = owner?.kind === "guest" ? owner.guestId : null;
  const userId = owner?.kind === "user" ? owner.userId : null;
  const [row] = await sql<{ times: (Date | null)[] }[]>`
    select array[
      (array_agg(r.created_at order by r.created_at desc)
        filter (where r.ip_hash = ${ip}))[${RUNS_PER_HOUR.ip}],
      (array_agg(r.created_at order by r.created_at desc)
        filter (where d.owner_guest_id = ${guestId}))[${RUNS_PER_HOUR.guest}],
      (array_agg(r.created_at order by r.created_at desc)
        filter (where d.owner_user_id = ${userId}))[${RUNS_PER_HOUR.user}]
    ] as times
    from curator_run r
    left join playlist_draft d on d.id = r.draft_id
    where r.created_at > ${new Date(now.getTime() - HOUR_MS)}
      and (r.ip_hash = ${ip}
        or d.owner_guest_id = ${guestId}
        or d.owner_user_id = ${userId})`;
  const reached = row.times.filter((t): t is Date => t !== null);
  if (reached.length === 0) return null;
  const freesAt = Math.max(...reached.map((t) => t.getTime() + HOUR_MS));
  return rateLimited(freesAt - now.getTime());
}

// Null when this IP may get another guest token.
export async function limitGuests(
  ip: Buffer,
  now: Date,
): Promise<RateLimited | null> {
  const [{ reached }] = await sql<{ reached: Date | null }[]>`
    select (array_agg(created_at order by created_at desc))[${GUESTS_PER_IP_PER_HOUR}] as reached
    from guest
    where ip_hash = ${ip} and created_at > ${new Date(now.getTime() - HOUR_MS)}`;
  return reached
    ? rateLimited(reached.getTime() + HOUR_MS - now.getTime())
    : null;
}

// A fixed one-minute window per process. Instances don't share counts, so the
// effective limit scales with instances; enough to stop scraping and log floods.
let window = { start: 0, counts: new Map<string, number>() };

export function limitPlain(
  route: string,
  ip: Buffer,
  now: Date,
): RateLimited | null {
  const start = now.getTime() - (now.getTime() % MINUTE_MS);
  if (start !== window.start) window = { start, counts: new Map() };
  const key = `${route}:${ip.toString("hex")}`;
  const count = (window.counts.get(key) ?? 0) + 1;
  window.counts.set(key, count);
  return count > PLAIN_PER_IP_PER_MINUTE
    ? rateLimited(start + MINUTE_MS - now.getTime())
    : null;
}
