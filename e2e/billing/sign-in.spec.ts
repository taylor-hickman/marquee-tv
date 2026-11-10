import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDraftResponse } from "@/contracts";
import { expectNoAxeViolations } from "../support/axe";
import { signInLink } from "./support";

// J7 step 3b: the email link, read from the local stack's mail server, signs
// the person in and brings them back to the plan screen for the held draft.

test("an email link signs in and returns to the plan screen", async ({
  page,
  request,
}) => {
  const created = createDraftResponse.parse(
    await (
      await request.post("/api/drafts", { data: { creationMethod: "typed" } })
    ).json(),
  );
  const draftId = created.draft.draft.id;
  await page.addInitScript(
    (token) => localStorage.setItem("guest_token", token),
    created.guestToken!,
  );

  await page.goto(`/plan?draft=${draftId}&plan=subscription`);
  await expect(
    page.getByRole("heading", { name: "First set was free." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Every set/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoAxeViolations(page);

  const email = `${randomUUID()}@example.test`;
  const signIn = page.waitForResponse("**/api/auth/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Check your email.")).toBeVisible();
  // The guest token went along, so the link carries a claim code.
  expect((await (await signIn).json()).redirectTo).toContain("claim=");

  await page.goto(await signInLink(email));
  await expect(page).toHaveURL(`/plan?draft=${draftId}&plan=subscription`);
  await expect(page.getByRole("button", { name: "Pay $4.99" })).toBeVisible();
  await expectNoAxeViolations(page);
});
