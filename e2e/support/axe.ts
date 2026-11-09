import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  expect(
    violations.map((v) => ({
      rule: v.id,
      targets: v.nodes.map((n) => n.target.join(" ")),
    })),
  ).toEqual([]);
}
