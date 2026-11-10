import { describe, expect, test } from "vitest";
import { brief as briefSchema, draftView, type StreamEvent } from "@/contracts";
import { examples } from "@/contracts/examples";
import { advance, failureMessage, starting, stepStatus } from "./progress";

const brief = briefSchema.parse(examples.brief);
const events: StreamEvent[] = [
  { type: "started", runId: "6a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" },
  { type: "brief", brief, echo: "2 hours · starts mellow" },
  { type: "candidates", count: 140 },
];

const statuses = (p: typeof starting) => [0, 1, 2].map((i) => stepStatus(p, i));

describe("generation progress", () => {
  test("each stream event moves the steps on", () => {
    const seen = [];
    let progress = starting;
    for (const event of events) {
      progress = advance(progress, event);
      seen.push(statuses(progress));
    }
    expect(seen).toEqual([
      ["Now", "Next", "Next"],
      ["Done", "Now", "Next"],
      ["Done", "Done", "Now"],
    ]);
    expect(progress.echo).toBe("2 hours · starts mellow");
  });

  test("an error marks the step under way as failed and keeps the echo", () => {
    let progress = advance(advance(starting, events[1]), {
      type: "error",
      code: "generation_failed",
    });
    expect(statuses(progress)).toEqual(["Done", "Failed", "Next"]);
    expect(progress.echo).toBe("2 hours · starts mellow");
    expect(progress.failure).toMatch(/Nothing is lost/);

    progress = advance(progress, events[0]);
    expect(progress).toEqual(starting);
  });

  test("a result leaves the steps alone; the editor renders it", () => {
    const progress = advance(starting, events[2]);
    expect(
      advance(progress, {
        type: "result",
        draft: draftView.parse(examples.draftView),
        warnings: [],
      }),
    ).toBe(progress);
  });
});

describe("failure messages", () => {
  test("a rate limit says when to try again", () => {
    expect(failureMessage({ error: "rate_limited", retryAfterS: 30 })).toBe(
      "Too many runs. Try again in 30 s.",
    );
  });

  test("a failure with no body reads as unreachable", () => {
    expect(failureMessage(null)).toMatch(/Nothing is lost/);
  });
});
