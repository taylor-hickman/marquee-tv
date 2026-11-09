import { sql } from "../db";
import { describe, expect, test } from "vitest";
import * as factories from ".";

const tableOf = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe("factories", () => {
  test("every table has a factory", async () => {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public' order by 1`;
    expect(Object.keys(factories).map(tableOf).sort()).toEqual(
      tables.map((t) => t.tablename),
    );
  });

  test.each(Object.entries(factories))(
    "%s inserts a valid row, twice",
    async (_, factory) => {
      const [first, second] = [await factory(), await factory()];
      expect(first).toBeTruthy();
      expect(second).not.toEqual(first);
    },
  );

  test("overrides replace defaults and reuse the given parent", async () => {
    const draft = await factories.playlistDraft({ title: "Set" });
    const revision = await factories.playlistRevision({ draft_id: draft.id });
    const next = await factories.playlistRevision({ draft_id: draft.id });
    expect(draft.title).toBe("Set");
    expect([revision.number, next.number]).toEqual([1, 2]);
  });
});
