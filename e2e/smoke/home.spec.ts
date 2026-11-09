import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../support/axe";

test("the home page loads with no axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marquee TV" })).toBeVisible();
  await expectNoAxeViolations(page);
});
