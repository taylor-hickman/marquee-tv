import "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { briefContext } from ".";

vi.mock("server-only", () => ({}));

describe("briefContext", () => {
  test("lists the seeded publishers and series", async () => {
    const context = await briefContext();
    expect(context.publishers).toContainEqual({ id: 1, name: "NPR Music" });
    expect(context.series).toHaveLength(6);
    expect(context.series).toContainEqual({
      id: 1,
      publisher_id: 1,
      name: "Tiny Desk Concerts",
      convention: "stripped-down, behind a desk in a small office",
    });
  });

  test("finds an artist by exact name or alias, ignoring case and spacing", async () => {
    const { artistIdFor } = await briefContext();
    expect(await artistIdFor("Fontaines D.C.")).toBe(13);
    expect(await artistIdFor("fontaines dc")).toBe(13);
    expect(await artistIdFor("  Tyler The Creator ")).toBe(4);
  });

  test("returns null for a name that only partly matches or is unknown", async () => {
    const { artistIdFor } = await briefContext();
    expect(await artistIdFor("Fontaines")).toBeNull();
    expect(await artistIdFor("Nobody At All")).toBeNull();
    expect(await artistIdFor("")).toBeNull();
  });
});
