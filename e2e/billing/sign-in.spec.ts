import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { checkoutRequest, createDraftResponse } from "@/contracts";
import { expectNoAxeViolations } from "../support/axe";
import { signInLink, sql } from "./support";

// J7 steps 3b and 4: the email link, read from the local stack's mail server,
// signs the guest in, claims their drafts and brings them back to the plan
// screen, where Pay opens Checkout for the held draft.

test("an email link signs in, claims the held draft and pays from the plan screen", async ({
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
  const pay = page.getByRole("button", { name: "Pay $4.99" });
  await expect(pay).toBeVisible();
  await expectNoAxeViolations(page);

  // The claim moved the guest's draft to the user, so Checkout can bind to it.
  const [draft] = await sql`
    select d.owner_user_id, d.owner_guest_id, u.email from playlist_draft d
    left join app_user u on u.id = d.owner_user_id where d.id = ${draftId}`;
  expect(draft).toMatchObject({ owner_guest_id: null, email });

  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Checkout</title>",
    }),
  );
  const checkout = page.waitForResponse("**/api/billing/checkout");
  await pay.click();
  const response = await checkout;
  expect(response.status()).toBe(200);
  expect(checkoutRequest.parse(response.request().postDataJSON())).toEqual({
    plan: "subscription",
    draftId,
  });
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);
});
