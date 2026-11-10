import { briefInput, type BriefInput, type DraftId } from "@/contracts";

// POST /api/drafts keeps only the length, and the editor starts generation on
// arrival (architecture 7.1), so the brief rides from the landing to the editor
// in session storage. The editor takes it once.

const key = (draftId: DraftId) => `pending_brief:${draftId}`;

export function savePendingBrief(draftId: DraftId, input: BriefInput) {
  try {
    sessionStorage.setItem(key(draftId), JSON.stringify(input));
  } catch {
    // Blocked or full: the editor reads null.
  }
}

export function takePendingBrief(draftId: DraftId): BriefInput | null {
  try {
    const raw = sessionStorage.getItem(key(draftId));
    sessionStorage.removeItem(key(draftId));
    if (raw === null) return null;
    const parsed = briefInput.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
