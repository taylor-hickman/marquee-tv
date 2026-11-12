import "server-only";
import type {
  ApiResult,
  DraftId,
  UserId,
  YouTubeExportResponse,
} from "@/contracts";
import { sql } from "@/lib/db";
import { getFlag } from "@/lib/flags";
import { getDraft } from "@/modules/playlist";
import { accessToken } from "./oauth";

// Save to my YouTube (PRD 10.2, J12): one playlists.insert, then one
// playlistItems.insert per video in the revision's order, each checked against
// what the API returns. export_job holds one row per (draft, revision), so a
// second tap returns the first playlist, and a failed export resumes from the
// item it stopped at rather than starting a second playlist.

const API = "https://www.googleapis.com/youtube/v3";
// A job that hasn't moved in this long is taken to have died with its request.
const STALE = "2 minutes";

type Job = {
  id: string;
  status: "running" | "done" | "failed";
  youtube_playlist_id: string | null;
  items_done: number;
};

const done = (playlistId: string): YouTubeExportResponse => ({
  status: "done",
  playlistId,
  url: `https://www.youtube.com/playlist?list=${playlistId}`,
});

async function youtube(token: string, path: string, body: unknown) {
  return fetch(`${API}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// The job for this revision, claimed for this request when it is new, failed,
// or its request died; otherwise the finished playlist, or `running` while
// another request has it.
async function claim(
  userId: UserId,
  draftId: DraftId,
  revision: number,
): Promise<Job | YouTubeExportResponse> {
  const [created] = await sql<Job[]>`
    insert into export_job (draft_id, revision, user_id)
    values (${draftId}, ${revision}, ${userId})
    on conflict (draft_id, revision) do nothing
    returning id, status, youtube_playlist_id, items_done`;
  if (created) return created;
  const [taken] = await sql<Job[]>`
    update export_job set status = 'running', updated_at = now()
    where draft_id = ${draftId} and revision = ${revision}
      and (status = 'failed'
        or (status = 'running' and updated_at < now() - ${STALE}::interval))
    returning id, status, youtube_playlist_id, items_done`;
  if (taken) return taken;
  const [existing] = await sql<Job[]>`
    select id, status, youtube_playlist_id, items_done from export_job
    where draft_id = ${draftId} and revision = ${revision}`;
  return existing.status === "done"
    ? done(existing.youtube_playlist_id!)
    : { status: "running" };
}

const fail = async (
  job: Job,
  error: "youtube_not_connected" | "youtube_failed",
) => {
  await sql`
    update export_job set status = 'failed', updated_at = now()
    where id = ${job.id}`;
  return { ok: false as const, error: { error } };
};

export async function exportRevision(
  userId: UserId,
  draftId: DraftId,
  baseRevision: number,
): Promise<ApiResult<YouTubeExportResponse>> {
  if ((await getFlag("handoff_mode")) !== "api") {
    return { ok: false, error: { error: "not_found" } };
  }
  const [draft] = await sql<
    { current_revision: number | null; title: string | null }[]
  >`
    select current_revision, title from playlist_draft
    where id = ${draftId} and owner_user_id = ${userId}`;
  if (!draft) return { ok: false, error: { error: "not_found" } };
  if (draft.current_revision !== baseRevision) {
    const current = await getDraft({ kind: "user", userId }, draftId);
    return current.ok
      ? { ok: false, error: { error: "conflict", current: current.value } }
      : current;
  }

  const running = await claim(userId, draftId, baseRevision);
  if (!("id" in running)) return { ok: true, value: running };

  const token = await accessToken(userId).catch(() => undefined);
  if (token === null) return fail(running, "youtube_not_connected");
  if (token === undefined) return fail(running, "youtube_failed");

  let playlistId = running.youtube_playlist_id;
  if (!playlistId) {
    const response = await youtube(token, "playlists?part=snippet,status", {
      snippet: {
        title: draft.title ?? "Marquee TV set",
        description: "Made with Marquee TV. getmarquee.tv",
      },
      status: { privacyStatus: "private" },
    }).catch(() => null);
    const created = (await response?.json().catch(() => null)) as {
      id?: string;
    } | null;
    if (!response?.ok || !created?.id) return fail(running, "youtube_failed");
    playlistId = created.id;
    await sql`
      update export_job set youtube_playlist_id = ${playlistId},
        updated_at = now()
      where id = ${running.id}`;
  }

  // Performances deleted from the catalog since the revision drop out, as in
  // the share link; a video YouTube no longer has (videoNotFound) is skipped.
  const [{ videoIds }] = await sql<{ videoIds: string[] }[]>`
    select coalesce((
      select array_agg(p.video_id order by e.ord)
      from jsonb_array_elements(r.items) with ordinality e(item, ord)
      join performance p on p.id = (e.item->>'performance_id')::bigint
    ), '{}') as "videoIds"
    from playlist_revision r
    where r.draft_id = ${draftId} and r.number = ${baseRevision}`;

  for (let i = running.items_done; i < videoIds.length; i++) {
    const videoId = videoIds[i];
    const response = await youtube(token, "playlistItems?part=snippet", {
      snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
    }).catch(() => null);
    const item = (await response?.json().catch(() => null)) as {
      snippet?: { playlistId?: string; resourceId?: { videoId?: string } };
      error?: { errors?: { reason?: string }[] };
    } | null;
    const inserted =
      response?.ok &&
      item?.snippet?.playlistId === playlistId &&
      item.snippet.resourceId?.videoId === videoId;
    // playlistNotFound is a 404 too, and must not empty the playlist.
    const gone = item?.error?.errors?.some((e) => e.reason === "videoNotFound");
    if (!inserted && !gone) return fail(running, "youtube_failed");
    await sql`
      update export_job set items_done = ${i + 1}, updated_at = now()
      where id = ${running.id}`;
  }

  await sql`
    update export_job set status = 'done', updated_at = now()
    where id = ${running.id}`;
  return { ok: true, value: done(playlistId) };
}
