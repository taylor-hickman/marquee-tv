import { useSyncExternalStore } from "react";
import type { ApiResult, DraftView } from "@/contracts";
import { setDraftCache } from "./storage";

// The draft a screen renders, and the revision every write carries
// (architecture 9.1). A 409 means another tab or phone wrote first: its body
// holds the current draft, which replaces ours, so the screen re-renders on the
// server's list. Every draft set here is also cached for the next visit.

type BaseRevision = number | null;

export function createDraftState(initial: DraftView) {
  let current = initial;
  const listeners = new Set<() => void>();

  function set(next: DraftView) {
    current = next;
    setDraftCache(next);
    for (const listener of listeners) listener();
  }

  // Sends with the current revision; a conflict replaces local state.
  async function send<T>(
    request: (baseRevision: BaseRevision) => Promise<ApiResult<T>>,
  ): Promise<ApiResult<T>> {
    const result = await request(current.revision?.number ?? null);
    if (!result.ok && result.error.error === "conflict") {
      set(result.error.current);
    }
    return result;
  }

  return {
    get: () => current,
    set,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    send,
    // For writes that answer with the draft (ops, undo): success replaces it too.
    async write(
      request: (baseRevision: BaseRevision) => Promise<ApiResult<DraftView>>,
    ) {
      const result = await send(request);
      if (result.ok) set(result.value);
      return result;
    },
  };
}

export type DraftState = ReturnType<typeof createDraftState>;

export function useDraft(state: DraftState): DraftView {
  return useSyncExternalStore(state.subscribe, state.get, state.get);
}
