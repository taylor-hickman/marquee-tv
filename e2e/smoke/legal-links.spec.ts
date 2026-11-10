import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

// /privacy and /terms have to be reachable before the first sign-in
// (architecture 9.1): the footer links both on every page, and so does the
// plan screen's sign-in step.

const legal = [
  { name: "Privacy", path: "/privacy", heading: "Privacy policy" },
  { name: "Terms", path: "/terms", heading: "Terms of service" },
];

// Clicks the link, then asks the server for the page it landed on.
async function follow(page: Page, within: Locator, link: (typeof legal)[0]) {
  await within.getByRole("link", { name: link.name, exact: true }).click();
  await expect(page).toHaveURL(link.path);
  await expect(
    page.getByRole("heading", { level: 1, name: link.heading }),
  ).toBeVisible();
  expect((await page.request.get(page.url())).status()).toBe(200);
}

for (const link of legal) {
  test(`the footer's ${link.name} link opens ${link.path}`, async ({
    page,
  }) => {
    for (const from of ["/", "/browse", link.path]) {
      await page.goto(from);
      await follow(page, page.getByRole("contentinfo"), link);
    }
  });

  // The plan screen shows its sign-in step for any draft ID while nobody is
  // signed in, so this one needs no draft (and no guest from the hourly limit).
  test(`the sign-in step's ${link.name} link opens ${link.path}`, async ({
    page,
  }) => {
    await page.goto(`/plan?draft=${randomUUID()}`);
    await expect(page.getByRole("button", { name: "Send link" })).toBeVisible();
    await follow(page, page.getByRole("main"), link);
  });
}
