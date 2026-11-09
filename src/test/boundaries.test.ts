import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

// Architecture 3's module boundaries, held by no-restricted-imports in
// eslint.config.mjs.
const eslint = new ESLint();

async function restricted(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("curator never imports the db client", () => {
  test.each(['import "@/lib/db";', 'import "../../lib/db/client";'])(
    "%s",
    async (source) => {
      expect(
        await restricted("src/modules/curator/compose/compose.ts", source),
      ).toHaveLength(1);
    },
  );
});

describe("modules import each other only through index.ts", () => {
  test.each([
    'import "@/modules/catalog/search";',
    'import "../catalog/search";',
  ])("%s is refused", async (source) => {
    expect(
      await restricted("src/modules/curator/compose.ts", source),
    ).toHaveLength(1);
  });

  test.each([
    'import "@/modules/catalog";',
    'import "@/modules/billing/testing";',
    'import "./validate";',
  ])("%s is allowed", async (source) => {
    expect(
      await restricted("src/modules/curator/compose.ts", source),
    ).toHaveLength(0);
  });

  test("a route may not reach inside a module", async () => {
    expect(
      await restricted(
        "src/app/api/drafts/route.ts",
        'import "@/modules/playlist/ops";',
      ),
    ).toHaveLength(1);
  });
});
