import "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { catalogSearchResponse, errorBody } from "@/contracts";
import { PLAIN_PER_IP_PER_MINUTE } from "@/lib/rate-limit";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

let n = 0;
const get = (query: string, ip = `198.51.100.${++n}`) =>
  GET(
    new Request(`http://localhost/api/catalog/search?${query}`, {
      headers: { "x-forwarded-for": ip },
    }),
  );

describe("GET /api/catalog/search", () => {
  test("returns a page of performance cards", async () => {
    const response = await get("q=tiny%20desk&publisherId=1&offset=0");
    expect(response.status).toBe(200);
    const body = catalogSearchResponse.parse(await response.json());
    expect(body.performances.length).toBeGreaterThan(0);
    for (const p of body.performances) expect(p.publisher.id).toBe(1);
  });

  test("rejects a malformed query with 400", async () => {
    const response = await get("publisherId=abc");
    expect(response.status).toBe(400);
    expect(errorBody.parse(await response.json())).toMatchObject({
      error: "invalid_request",
    });
  });

  test("limits each address per minute", async () => {
    // Inside one fixed window, whatever the wall clock says.
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-11-09T12:00:10Z"),
    });
    const ip = "203.0.113.77";
    for (let i = 0; i < PLAIN_PER_IP_PER_MINUTE; i++) {
      expect((await get("seriesId=6", ip)).status).toBe(200);
    }
    const limited = await get("seriesId=6", ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("50");
    vi.useRealTimers();
  });
});
