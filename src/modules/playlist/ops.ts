import type { Op, PerformanceId, RevisionItem } from "@/contracts";

// What a manual edit can change: the revision's list and removals, and the
// draft's title and description.
export type EditState = {
  items: RevisionItem[];
  removedIds: PerformanceId[];
  title: string | null;
  description: string | null;
};

// A manual pick from the browser or a replace: the curator may place it, but
// never drop it (architecture 6.3).
const manual = (id: PerformanceId): RevisionItem => ({
  performance_id: id,
  pinned: "include",
  source: "manual",
});

// Applies POST /ops in order. Any op that doesn't fit the list refuses the whole
// batch, so a write never lands half-applied.
export function edit(
  from: EditState,
  ops: Op[],
): { ok: true; value: EditState } | { ok: false; issues: string[] } {
  const items = [...from.items];
  let removedIds = [...from.removedIds];
  let { title, description } = from;

  for (const [n, op] of ops.entries()) {
    const fail = (issue: string) => ({
      ok: false as const,
      issues: [`ops.${n}: ${issue}`],
    });
    if (op.op === "rename") {
      title = op.title ?? title;
      description = op.description ?? description;
      continue;
    }

    const newId =
      op.op === "add"
        ? op.performance_id
        : op.op === "replace"
          ? op.with_performance_id
          : null;
    if (newId !== null && items.some((i) => i.performance_id === newId)) {
      return fail(`performance ${newId} is already in the list`);
    }
    removedIds = removedIds.filter((id) => id !== newId);

    if (op.op === "add") {
      const index = op.index ?? items.length;
      if (index > items.length) {
        return fail(`index ${index} is past the end of the list`);
      }
      items.splice(index, 0, manual(op.performance_id));
      continue;
    }

    const at = items.findIndex((i) => i.performance_id === op.performance_id);
    if (at === -1) {
      return fail(`performance ${op.performance_id} is not in the list`);
    }
    const item = items[at];
    switch (op.op) {
      case "pin":
        items[at] = { ...item, pinned: "position" };
        break;
      case "unpin":
        items[at] = { ...item, pinned: "none" };
        break;
      case "remove":
        items.splice(at, 1);
        removedIds.push(item.performance_id);
        break;
      case "replace":
        items[at] = manual(op.with_performance_id);
        removedIds.push(item.performance_id);
        break;
      case "move":
        if (op.to_index >= items.length) {
          return fail(`index ${op.to_index} is past the end of the list`);
        }
        // Moving a row by hand is what makes a position pin (PRD 7.4).
        items.splice(at, 1);
        items.splice(op.to_index, 0, { ...item, pinned: "position" });
        break;
    }
  }
  return { ok: true, value: { items, removedIds, title, description } };
}
