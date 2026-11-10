import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { shareRedirectResponse } from "@/contracts";
import { handoffParts, PART_SIZE } from "./handoff-url";

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `vid${String(i).padStart(8, "0")}`);

const queue = (url: string) =>
  new URL(url).searchParams.get("video_ids")!.split(",");

describe("handoffParts", () => {
  test("splits a 120-item list into parts of 50, 50 and 20", () => {
    const list = ids(120);
    const parts = handoffParts(list);
    expect(parts.map((p) => p.ids.length)).toEqual([50, 50, 20]);
    expect(parts.flatMap((p) => p.ids)).toEqual(list);
    expect(parts.map((p) => queue(p.url))).toEqual(parts.map((p) => p.ids));
  });

  test("builds a watch_videos URL with the ids in order", () => {
    const [part] = handoffParts(["ferZnZ0_rSM", "Ow4aFqRdlbI"]);
    expect(part.url).toBe(
      "https://www.youtube.com/watch_videos?video_ids=ferZnZ0_rSM,Ow4aFqRdlbI",
    );
    expect(
      shareRedirectResponse.safeParse({ location: part.url }).success,
    ).toBe(true);
  });

  test("play from here slices the list before splitting", () => {
    const list = ids(120);
    const parts = handoffParts(list, 30);
    // 90 left: 50 then 40, not the 20, 50, 20 that splitting first would give.
    expect(parts.map((p) => p.ids.length)).toEqual([50, 40]);
    expect(parts[0].ids[0]).toBe(list[30]);
    expect(parts.flatMap((p) => p.ids)).toEqual(list.slice(30));
  });

  test("a list of exactly 50 is one part", () => {
    expect(handoffParts(ids(50))).toHaveLength(1);
  });

  test("starting at the end, or an empty list, gives no parts", () => {
    expect(handoffParts(ids(3), 3)).toEqual([]);
    expect(handoffParts([])).toEqual([]);
  });

  test.each([-1, 4, 1.5, Number.NaN])("refuses start index %s", (start) => {
    expect(() => handoffParts(ids(3), start)).toThrow(RangeError);
  });

  test("for any list and start, the parts concatenate to the slice and none holds more than 50", () => {
    const videoId = fc.stringMatching(/^[A-Za-z0-9_-]{11}$/);
    fc.assert(
      fc.property(
        fc
          .array(videoId, { maxLength: 260 })
          .chain((list) =>
            fc.tuple(fc.constant(list), fc.nat({ max: list.length })),
          ),
        ([list, start]) => {
          const parts = handoffParts(list, start);
          expect(parts.flatMap((p) => p.ids)).toEqual(list.slice(start));
          for (const part of parts) {
            expect(part.ids.length).toBeGreaterThan(0);
            expect(part.ids.length).toBeLessThanOrEqual(PART_SIZE);
            expect(queue(part.url)).toEqual(part.ids);
          }
        },
      ),
    );
  });
});
