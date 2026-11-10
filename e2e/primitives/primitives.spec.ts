import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations } from "../support/axe";

// /dev/primitives shows every primitive in a dark and a light panel. Each run
// sets the system theme too, so the shell around the panels (and the toast,
// which lives in the shell) is checked in both.

const panels = ["dark", "light"] as const;

const background = (page: Page, theme: string) =>
  page
    .getByTestId(theme)
    .evaluate((el) => getComputedStyle(el).backgroundColor);

for (const colorScheme of panels) {
  test.describe(`system theme ${colorScheme}`, () => {
    test.use({ colorScheme });

    test("both panels render in their theme and pass axe", async ({ page }) => {
      await page.goto("/dev/primitives");
      expect(await background(page, "dark")).toBe("rgb(17, 17, 17)");
      expect(await background(page, "light")).toBe("rgb(242, 239, 232)");
      await expectNoAxeViolations(page);
    });

    for (const theme of panels) {
      test(`${theme} panel: chip, toast, sheet and dialog pass axe`, async ({
        page,
      }) => {
        await page.goto("/dev/primitives");
        const panel = page.getByTestId(theme);

        const chip = panel.getByRole("button", { name: "After Hours" });
        await chip.click();
        await expect(chip).toHaveAttribute("aria-pressed", "true");
        await expect(
          panel.getByRole("button", { name: "Friends Over" }),
        ).toHaveAttribute("aria-pressed", "false");

        await panel.getByRole("button", { name: "Toast" }).click();
        await expect(page.getByRole("status")).toHaveText("Link copied");
        await expectNoAxeViolations(page);

        const openSheet = panel.getByRole("button", { name: "Sheet" });
        await openSheet.click();
        const sheet = page.getByRole("dialog", { name: "Play on YouTube" });
        await expect(sheet).toBeVisible();
        await expectNoAxeViolations(page);
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(openSheet).toBeFocused();

        await panel.getByRole("button", { name: "Dialog" }).click();
        const dialog = page.getByRole("dialog", { name: "Delete account" });
        await expect(dialog).toBeVisible();
        await expectNoAxeViolations(page);
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toBeHidden();
      });
    }
  });
}
