import type { DraftId, PerformanceId } from "@/contracts";
import type { ApiClient } from "@/lib/client/api";

// The drawer's way into the editor (J4 step 3). The picks become a new draft's
// first revision through manual adds, which the server records as inclusion
// pins (architecture 6.3). With `fill`, the editor URL tells the editor to
// start a fill run on arrival; the run, and its entitlement check, are the
// editor's.

export type Run = "fill" | null;

export function editorPath(id: DraftId, run: Run): string {
  const path = `/d/${encodeURIComponent(id)}`;
  return run ? `${path}?run=${run}` : path;
}

export async function draftFromPicks(
  api: ApiClient,
  picks: PerformanceId[],
): Promise<DraftId | null> {
  const created = await api.createDraft({ creationMethod: "manual" });
  if (!created.ok) return null;
  const id = created.value.draft.draft.id;
  const written = await api.ops(id, {
    baseRevision: null,
    ops: picks.map((performance_id) => ({ op: "add", performance_id })),
  });
  return written.ok ? id : null;
}
