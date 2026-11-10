import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { getFlag } from ".";

vi.mock("server-only", () => ({}));

describe("getFlag", () => {
  test("handoff_mode is seeded to url", async () => {
    expect(await getFlag("handoff_mode")).toBe("url");
  });

  test("reads the current value, so a flip needs no deploy", async () => {
    await sql`update app_flag set value = 'copy_list' where key = 'handoff_mode'`;
    try {
      expect(await getFlag("handoff_mode")).toBe("copy_list");
    } finally {
      await sql`update app_flag set value = 'url' where key = 'handoff_mode'`;
    }
  });

  test("refuses a value outside the flag's schema", async () => {
    await sql`update app_flag set value = 'upload' where key = 'handoff_mode'`;
    try {
      await expect(getFlag("handoff_mode")).rejects.toThrow();
    } finally {
      await sql`update app_flag set value = 'url' where key = 'handoff_mode'`;
    }
  });
});
