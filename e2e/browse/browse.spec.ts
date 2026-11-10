import { expect, test, type Page } from "@playwright/test";
import { draftView } from "@/contracts";
import { expectNoAxeViolations } from "../support/axe";

// J4 against the seeded catalog (db/fixtures/catalog.json). The two picks:
// Caribou on KEXP runs 30:56, Khruangbin's KEXP at Home set 15:58.
const CARIBOU = { id: 167, title: "Caribou - Full Performance (Live on KEXP)" };
const KHRUANGBIN = {
  id: 233,
  title: "Khruangbin - Full Performance (Live on KEXP at Home)",
};

// The PR gate reaches no third party: thumbnails stay placeholders.
test.beforeEach(async ({ page }) => {
  await page.route("https://i.ytimg.com/**", (route) => route.abort());
  await page.goto("/browse");
});

const drawer = (page: Page) =>
  page.getByRole("complementary", { name: /^Playlist/ });

async function add(page: Page, search: string, title: string) {
  await page.getByRole("searchbox", { name: "Search" }).fill(search);
  await page
    .getByRole("article")
    .filter({ hasText: title })
    .getByRole("button", { name: "Add" })
    .click();
}

test("add puts picks in the drawer in order, with the running total", async ({
  page,
}) => {
  await expect(drawer(page)).toContainText("Playlist · 0");
  await expect(drawer(page)).toContainText("0 m");

  await add(page, "Caribou", CARIBOU.title);
  await expect(drawer(page)).toContainText("Playlist · 1");
  await expect(drawer(page)).toContainText("31 m");

  await add(page, "Khruangbin", KHRUANGBIN.title);
  await expect(drawer(page)).toContainText("Playlist · 2");
  await expect(drawer(page)).toContainText("47 m");
  await expect(drawer(page).getByRole("listitem")).toHaveText([
    /Caribou.*30:56/,
    /Khruangbin.*15:58/,
  ]);
  await expectNoAxeViolations(page);

  await drawer(page)
    .getByRole("listitem")
    .filter({ hasText: "Caribou" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(drawer(page)).toContainText("Playlist · 1");
  await expect(drawer(page)).toContainText("16 m");
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: KHRUANGBIN.title })
      .getByRole("button", { name: "Remove" }),
  ).toBeVisible();
});

test("filters narrow the results, and nothing matching says so", async ({
  page,
}) => {
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Publisher" }).selectOption("KEXP");
  const cards = page.getByRole("article");
  await expect(cards.first()).toContainText("KEXP ·");
  for (const card of await cards.all())
    await expect(card).toContainText("KEXP ·");

  await page.getByRole("searchbox", { name: "Search" }).fill("zzzz");
  await expect(
    page.getByText("Nothing matches. Check the spelling or clear a filter."),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("let AI fill the rest carries the picks to the editor as inclusion pins", async ({
  page,
}) => {
  await add(page, "Khruangbin", KHRUANGBIN.title);
  await add(page, "Caribou", CARIBOU.title);
  await expectNoAxeViolations(page);

  await drawer(page)
    .getByRole("button", { name: "Let AI fill the rest" })
    .click();
  await page.waitForURL(/\/d\/[0-9a-f-]{36}\?run=fill$/);
  const id = new URL(page.url()).pathname.split("/")[2];

  const guestToken = await page.evaluate(() =>
    localStorage.getItem("guest_token"),
  );
  const response = await page.request.get(`/api/drafts/${id}`, {
    headers: { "x-guest-token": guestToken ?? "" },
  });
  expect(response.ok()).toBe(true);
  const draft = draftView.parse(await response.json());
  expect(draft.draft.creationMethod).toBe("manual");
  expect(draft.revision?.items).toEqual([
    { performance_id: KHRUANGBIN.id, pinned: "include", source: "manual" },
    { performance_id: CARIBOU.id, pinned: "include", source: "manual" },
  ]);
});
