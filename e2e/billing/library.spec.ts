import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../support/axe";
import { signedInUser, userDraft } from "./support";

// J8: the library lists saved sets with Play and Edit and drafts with Continue.

test("a saved set re-opens in the editor and plays from the library", async ({
  page,
  request,
}) => {
  const { userId } = await signedInUser(page, request);
  const saved = await userDraft(userId, {
    title: "Slow Start, Late Groove",
    performances: 2,
  });
  const draft = await userDraft(userId);
  await page.addInitScript(() => {
    const log: string[] = [];
    Object.assign(window, { __log: log });
    window.open = (url) => {
      log.push(`open ${url}`);
      return null;
    };
    const send = window.fetch.bind(window);
    window.fetch = (...args) => {
      const url = String(args[0]);
      if (url.startsWith("/api/events")) log.push(`fetch ${url}`);
      return send(...args);
    };
  });

  await page.goto("/library");
  const savedRows = page.getByRole("region", { name: "Saved" });
  const row = savedRows.getByRole("listitem").filter({
    hasText: "Slow Start, Late Groove",
  });
  await expect(row).toContainText("Today");
  const drafts = page.getByRole("region", { name: "Drafts" });
  await expect(drafts.getByRole("link", { name: "Continue" })).toHaveAttribute(
    "href",
    `/d/${draft.id}`,
  );
  await expectNoAxeViolations(page);

  // Rule 4: the queue opens before any request.
  await row.getByRole("button", { name: "Play on YouTube" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __log: string[] }).__log),
    )
    .toEqual([
      `open https://www.youtube.com/watch_videos?video_ids=${saved.videoIds.join(",")}`,
      "fetch /api/events",
      "fetch /api/events",
    ]);

  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(`/d/${saved.id}`);
});

test("an empty library says so", async ({ page, request }) => {
  await signedInUser(page, request);
  await page.goto("/library");
  await expect(page.getByText("Nothing saved.")).toBeVisible();
  await expect(page.getByRole("link", { name: "New set" })).toHaveAttribute(
    "href",
    "/",
  );
  await expectNoAxeViolations(page);
});
