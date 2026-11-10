import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../support/axe";

test("the home page loads with no axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
});
