import { expect, test, type Page } from "@playwright/test";
import { createDraftRequest, draftView } from "@/contracts";
import { examples } from "@/contracts/examples";
import { expectNoAxeViolations } from "../support/axe";

// The landing page against the local stack: POST /api/drafts is real. The
// editor route belongs to E3, so these specs stop at its URL.

const editorUrl = /\/d\/[0-9a-f-]{36}$/;

async function submitAndReadBody(page: Page) {
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/api/drafts") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Make playlist" }).click();
  return createDraftRequest.parse((await request).postDataJSON());
}

test("a typed prompt creates a draft and lands on the editor route", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("region")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "2 h", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expectNoAxeViolations(page);

  await page
    .getByRole("textbox", { name: "Your set" })
    .fill("Soul and funk for a backyard barbecue");
  const body = await submitAndReadBody(page);
  expect(body).toMatchObject({
    creationMethod: "typed",
    input: {
      text: "Soul and funk for a backyard barbecue",
      durationS: 7200,
      seeds: [],
    },
  });
  expect(body.input?.mood).toBeUndefined();

  await expect(page).toHaveURL(editorUrl);
  expect(
    await page.evaluate(() => localStorage.getItem("guest_token")),
  ).toBeTruthy();
});

test("a chip prefills the prompt and a preset sets the length", async ({
  page,
}) => {
  await page.goto("/");
  const chip = page.getByRole("button", { name: "Dinner Party" });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Your set" })).not.toHaveValue(
    "",
  );

  await page.getByRole("button", { name: "3 h", exact: true }).click();
  const body = await submitAndReadBody(page);
  expect(body).toMatchObject({
    creationMethod: "chip",
    input: { mood: "dinner_party", durationS: 3 * 3600 },
  });
  await expect(page).toHaveURL(editorUrl);
});

test("custom takes a length in minutes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Surprise Me" }).click();
  await page.getByRole("button", { name: "Custom" }).click();
  const submit = page.getByRole("button", { name: "Make playlist" });
  await expect(submit).toBeDisabled();

  await page.getByRole("spinbutton", { name: "Minutes" }).fill("75");
  await expectNoAxeViolations(page);
  const body = await submitAndReadBody(page);
  expect(body.input?.durationS).toBe(75 * 60);
});

test.describe("returning guest", () => {
  const cached = draftView.parse(examples.draftView);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((draft) => {
      localStorage.setItem("draft_cache", draft);
      // Record the order of window.open and API calls; nothing navigates.
      // Next's own prefetches are left out.
      const log: string[] = [];
      Object.assign(window, { __log: log });
      window.open = (url) => {
        log.push(`open ${url}`);
        return null;
      };
      const send = window.fetch.bind(window);
      window.fetch = (...args) => {
        const url = String(args[0]);
        if (url.startsWith("/api/")) log.push(`fetch ${url}`);
        return send(...args);
      };
    }, JSON.stringify(cached));
  });

  test("a cached draft shows the returning-guest card above the prompt", async ({
    page,
  }) => {
    await page.goto("/");
    const card = page.getByRole("region", { name: cached.draft.title! });
    await expect(card).toBeVisible();
    await expect(card).toContainText("36 m");
    await expect(card.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      `/d/${cached.draft.id}`,
    );
    const cardTop = (await card.boundingBox())!.y;
    const promptTop = (await page
      .getByRole("textbox", { name: "Your set" })
      .boundingBox())!.y;
    expect(cardTop).toBeLessThan(promptTop);
    await expectNoAxeViolations(page);
  });

  test("rule 4: Play on YouTube opens the queue before any request", async ({
    page,
  }) => {
    const log = () =>
      page.evaluate(() => (window as unknown as { __log: string[] }).__log);
    await page.goto("/");
    // landing_viewed goes first; clear it so only the click's calls remain.
    await expect.poll(log).toEqual(["fetch /api/events"]);
    await page.evaluate(() =>
      (window as unknown as { __log: string[] }).__log.splice(0),
    );

    await page.getByRole("button", { name: "Play on YouTube" }).click();
    await expect
      .poll(log)
      .toEqual([
        "open https://www.youtube.com/watch_videos?video_ids=ferZnZ0_rSM,Ow4aFqRdlbI",
        "fetch /api/events",
        "fetch /api/events",
      ]);
  });
});
