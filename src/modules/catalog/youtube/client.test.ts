import { afterEach, expect, test, vi } from "vitest";
import { createYouTube, seconds } from "./client";

afterEach(() => vi.unstubAllGlobals());

test.each([
  ["PT45S", 45],
  ["PT18M30S", 1110],
  ["PT1H2M3S", 3723],
  ["P1DT2H", 93_600],
  ["P0D", 0],
])("%s is %i seconds", (duration, expected) => {
  expect(seconds(duration)).toBe(expected);
});

// Architecture 9.5: when the quota runs out, only ingestion stops.
test("an API error stops the job with YouTube's message", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json(
      {
        error: {
          code: 403,
          message:
            "The request cannot be completed because you have exceeded your quota.",
        },
      },
      { status: 403 },
    ),
  );
  const youtube = createYouTube("test-key");

  await expect(youtube.videos(["A2fixture01"])).rejects.toThrow(
    /videos\.list 403: .*exceeded your quota/,
  );
  expect(youtube.units).toBe(1);
});
