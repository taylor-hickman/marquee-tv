import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { createDraftRequest, createDraftResponse } from "@/contracts";
import { expectNoAxeViolations } from "../support/axe";

// The artist screen against the seeded catalog and the real routes: typeahead
// from GET /api/catalog/artists, submit through POST /api/drafts.

const artistBox = (page: Page) =>
  page.getByRole("combobox", { name: "Artist" });
const seedRow = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Seeds" })
    .getByRole("listitem")
    .filter({
      has: page.getByText(name, { exact: true }),
    });

async function submit(page: Page) {
  const [request, response] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().endsWith("/api/drafts") && r.method() === "POST",
    ),
    page.waitForResponse(
      (r) => r.url().endsWith("/api/drafts") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Make playlist" }).click(),
  ]);
  expect(response.status()).toBe(201);
  const { draft } = createDraftResponse.parse(await response.json());
  await expect(page).toHaveURL(`/d/${draft.draft.id}`);
  return createDraftRequest.parse(request.postDataJSON());
}

// The global reset empties app_flag, whose handoff_mode row a migration seeds
// and every draft read needs. Put it back until the reset keeps it (backlog:
// marquee-e2e-reset-keeps-the-handoff-mode-flag-row). A deploy has its own.
test.beforeAll(async () => {
  if (process.env.PLAYWRIGHT_BASE_URL) return;
  const { DB_URL } = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  const sql = postgres(DB_URL, { onnotice: () => {} });
  await sql`insert into app_flag (key, value) values ('handoff_mode', 'url')
    on conflict (key) do nothing`;
  await sql.end();
});

test.beforeEach(async ({ page }) => {
  await page.goto("/artist");
  await expect(
    page.getByRole("button", { name: "Make playlist" }),
  ).toBeDisabled();
});

test("catalog seeds are must-include and reach the draft", async ({ page }) => {
  await artistBox(page).fill("Khru");
  await page
    .getByRole("option", { name: /^Khruangbin\s*2 performances$/ })
    .click();
  await artistBox(page).fill("hiatus");
  await page.getByRole("option", { name: /^Hiatus Kaiyote/ }).click();

  const khruangbin = seedRow(page, "Khruangbin");
  await expect(khruangbin).toContainText("2 performances");
  await expect(
    page.getByRole("button", { name: "Must include Khruangbin" }),
  ).toHaveAttribute("aria-pressed", "true");
  const hiatus = page.getByRole("button", {
    name: "Must include Hiatus Kaiyote",
  });
  await hiatus.click();
  await expect(hiatus).toHaveAttribute("aria-pressed", "false");
  await expectNoAxeViolations(page);

  const body = await submit(page);
  expect(body.creationMethod).toBe("artist");
  expect(body.input?.seeds).toEqual([
    { artistId: expect.any(Number), name: "Khruangbin", mustInclude: true },
    {
      artistId: expect.any(Number),
      name: "Hiatus Kaiyote",
      mustInclude: false,
    },
  ]);
});

test("a name outside the catalog is a reference only", async ({ page }) => {
  await artistBox(page).fill("Radiohead");
  await expect(
    page.getByRole("option", { name: "Add “Radiohead”" }),
  ).toBeVisible();
  await artistBox(page).press("Enter");

  await expect(seedRow(page, "Radiohead")).toContainText(
    "Not in our catalog yet. We’ll use them as a reference.",
  );
  await expect(
    page.getByRole("button", { name: "Must include Radiohead" }),
  ).toBeDisabled();
  await expectNoAxeViolations(page);

  const body = await submit(page);
  expect(body.input?.seeds).toEqual([
    { name: "Radiohead", mustInclude: false },
  ]);
});

test("an artist with nothing to play says so and offers the closest artists", async ({
  page,
}) => {
  await artistBox(page).fill("Shame");
  await page.getByRole("option", { name: /^Shame\s*0 performances$/ }).click();

  await expect(seedRow(page, "Shame")).toContainText(
    "Nothing of theirs can play right now.",
  );
  await expect(
    page.getByRole("button", { name: "Must include Shame" }),
  ).toBeDisabled();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Add IDLES" }).click();
  await expect(
    page.getByRole("button", { name: "Must include IDLES" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Add IDLES" })).toHaveCount(0);

  const body = await submit(page);
  expect(body.input?.seeds).toEqual([
    { artistId: expect.any(Number), name: "Shame", mustInclude: false },
    { artistId: expect.any(Number), name: "IDLES", mustInclude: true },
  ]);
});
