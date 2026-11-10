import { describe, expect, test } from "vitest";
import type { Op, RevisionItem } from "@/contracts";
import { edit, type EditState } from "./ops";

const ai = (id: number): RevisionItem => ({
  performance_id: id,
  pinned: "none",
  source: "ai",
});

const state = (o: Partial<EditState> = {}): EditState => ({
  items: [ai(1), ai(2), ai(3)],
  removedIds: [],
  title: "Set",
  description: null,
  ...o,
});

const run = (ops: Op[], from = state()) => {
  const result = edit(from, ops);
  if (!result.ok) throw new Error(result.issues.join("; "));
  return result.value;
};

const ids = (s: EditState) => s.items.map((i) => i.performance_id);

describe("edit", () => {
  test("pin locks a row in place, unpin frees it", () => {
    const pinned = run([{ op: "pin", performance_id: 2 }]);
    expect(pinned.items[1]).toEqual({ ...ai(2), pinned: "position" });
    const unpinned = run([{ op: "unpin", performance_id: 2 }], pinned);
    expect(unpinned.items[1]).toEqual(ai(2));
  });

  test("remove takes the row out and records it as removed", () => {
    const next = run([{ op: "remove", performance_id: 2 }]);
    expect(ids(next)).toEqual([1, 3]);
    expect(next.removedIds).toEqual([2]);
  });

  test("move reorders and sets a position pin on the moved row only", () => {
    const next = run([{ op: "move", performance_id: 3, to_index: 0 }]);
    expect(next.items).toEqual([
      { ...ai(3), pinned: "position" },
      ai(1),
      ai(2),
    ]);
  });

  test("add appends a manual inclusion pin, or inserts at an index", () => {
    const appended = run([{ op: "add", performance_id: 9 }]);
    expect(appended.items.at(-1)).toEqual({
      performance_id: 9,
      pinned: "include",
      source: "manual",
    });
    const inserted = run([{ op: "add", performance_id: 9, index: 1 }]);
    expect(ids(inserted)).toEqual([1, 9, 2, 3]);
  });

  test("adding a removed performance takes it off the removed list", () => {
    const next = run(
      [{ op: "add", performance_id: 7 }],
      state({ removedIds: [7] }),
    );
    expect(next.removedIds).toEqual([]);
  });

  test("replace swaps the row in place and records the old one as removed", () => {
    const next = run([
      { op: "replace", performance_id: 2, with_performance_id: 9 },
    ]);
    expect(next.items[1]).toEqual({
      performance_id: 9,
      pinned: "include",
      source: "manual",
    });
    expect(next.removedIds).toEqual([2]);
  });

  test("rename sets the title, the description, or both", () => {
    expect(run([{ op: "rename", title: "New" }])).toMatchObject({
      title: "New",
      description: null,
    });
    expect(run([{ op: "rename", description: "Warm" }])).toMatchObject({
      title: "Set",
      description: "Warm",
    });
  });

  test("applies ops in order and leaves its input alone", () => {
    const from = state();
    const next = run(
      [
        { op: "remove", performance_id: 1 },
        { op: "move", performance_id: 3, to_index: 0 },
      ],
      from,
    );
    expect(ids(next)).toEqual([3, 2]);
    expect(from).toEqual(state());
  });

  test("refuses ops on rows that aren't in the list", () => {
    for (const op of [
      { op: "pin", performance_id: 9 },
      { op: "unpin", performance_id: 9 },
      { op: "remove", performance_id: 9 },
      { op: "move", performance_id: 9, to_index: 0 },
      { op: "replace", performance_id: 9, with_performance_id: 8 },
    ] satisfies Op[]) {
      expect(edit(state(), [op])).toEqual({
        ok: false,
        issues: ["ops.0: performance 9 is not in the list"],
      });
    }
  });

  test("refuses a duplicate and an index past the end", () => {
    expect(edit(state(), [{ op: "add", performance_id: 2 }])).toEqual({
      ok: false,
      issues: ["ops.0: performance 2 is already in the list"],
    });
    expect(
      edit(state(), [
        { op: "replace", performance_id: 1, with_performance_id: 2 },
      ]),
    ).toEqual({
      ok: false,
      issues: ["ops.0: performance 2 is already in the list"],
    });
    expect(edit(state(), [{ op: "add", performance_id: 9, index: 4 }])).toEqual(
      { ok: false, issues: ["ops.0: index 4 is past the end of the list"] },
    );
    expect(
      edit(state(), [{ op: "move", performance_id: 1, to_index: 3 }]),
    ).toEqual({
      ok: false,
      issues: ["ops.0: index 3 is past the end of the list"],
    });
  });
});
