import { draftView, type DraftView } from "@/contracts";

// What the browser keeps (architecture 4, 7.1, 7.2): the guest token, a cache of
// the current draft for instant rendering, and whether the handoff sheet has
// been seen. Local storage throws in private modes and when blocked, and is
// missing on the server, so every access is wrapped and a failure reads as empty.

const keys = {
  guestToken: "guest_token",
  draftCache: "draft_cache",
  handoffSheetSeen: "handoff_sheet_seen",
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Full, blocked or absent: the server still holds everything.
  }
}

export const getGuestToken = () => read(keys.guestToken);
export const setGuestToken = (token: string) => write(keys.guestToken, token);

// A cache written by an older build may no longer parse; it reads as empty.
export function getDraftCache(): DraftView | null {
  const raw = read(keys.draftCache);
  if (raw === null) return null;
  try {
    const parsed = draftView.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export const setDraftCache = (draft: DraftView) =>
  write(keys.draftCache, JSON.stringify(draft));

export const getHandoffSheetSeen = () => read(keys.handoffSheetSeen) === "1";
export const setHandoffSheetSeen = () => write(keys.handoffSheetSeen, "1");
