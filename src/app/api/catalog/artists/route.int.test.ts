import "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { catalogArtistsResponse, errorBody } from "@/contracts";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const get = (query: string) =>
  GET(new Request(`http://localhost/api/catalog/artists?${query}`));

describe("GET /api/catalog/artists", () => {
  test("returns matching artists with their playable counts", async () => {
    const response = await get("q=khruang");
    expect(response.status).toBe(200);
    const { artists } = catalogArtistsResponse.parse(await response.json());
    expect(artists[0]).toMatchObject({ name: "Khruangbin" });
    expect(artists[0].eligibleCount).toBeGreaterThan(0);
  });

  test("rejects a missing or blank q with 400", async () => {
    for (const query of ["", "q=%20%20"]) {
      const response = await get(query);
      expect(response.status).toBe(400);
      expect(errorBody.parse(await response.json())).toMatchObject({
        error: "invalid_request",
      });
    }
  });
});
