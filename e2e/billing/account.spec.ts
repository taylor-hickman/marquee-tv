import { expect, test } from "@playwright/test";
import { deleteAccountResponse } from "@/contracts";
import { examples } from "@/contracts/examples";
import { expectNoAxeViolations } from "../support/axe";
import { signedInUser, sql, userDraft } from "./support";

// J10: the plan, then delete my data after one confirmation, ending signed out
// on the landing page.

test("deleting my data returns to the landing page signed out", async ({
  page,
  request,
}) => {
  const { userId, storageKey } = await signedInUser(page, request);
  const draft = await userDraft(userId, { status: "active" });
  await sql`insert into entitlement (user_id, kind, status, period_end, draft_id)
            values (${userId}, 'session_pass', 'active',
                    now() + interval '7 days', ${draft.id})`;
  // DELETE /api/account is D3's; until it is on main the reply is the
  // contract's example.
  let deleted = false;
  await page.route("**/api/account", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleted = true;
    return route.fulfill({
      json: deleteAccountResponse.parse(examples.deleteAccountResponse),
    });
  });

  await page.goto("/account");
  await expect(page.getByText("One set · $2.99 once")).toBeVisible();
  await expect(page.getByText(/^Edits until /)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage billing" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Delete my data" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete my data" });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL("/");
  expect(deleted).toBe(true);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBeNull();
});

// J12's disconnect. The YouTube routes are mocked, as in e2e/editor/youtube.spec.ts:
// a real grant needs Google, which the PR gate never reaches.
test("YouTube shows while connected, and Disconnect revokes it and hides it", async ({
  page,
  request,
}) => {
  await signedInUser(page, request);
  let connected = true;
  let disconnects = 0;
  await page.route("**/api/youtube/connection", (route) => {
    if (route.request().method() === "DELETE") {
      disconnects++;
      connected = false;
    }
    return route.fulfill({ json: { connected } });
  });

  await page.goto("/account");
  const youtube = page.getByRole("region", { name: "YouTube" });
  await expect(youtube.getByText("Connected")).toBeVisible();
  await expectNoAxeViolations(page);

  await youtube.getByRole("button", { name: "Disconnect" }).click();
  await expect(youtube).toHaveCount(0);
  expect(disconnects).toBe(1);

  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(youtube).toHaveCount(0);
});
