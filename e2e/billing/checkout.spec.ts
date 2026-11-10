import { expect, test } from "@playwright/test";
import { checkoutRequest, streamEvent } from "@/contracts";
import { examples } from "@/contracts/examples";
import { checkoutCompleted } from "@/modules/billing/testing";
import { expectNoAxeViolations } from "../support/axe";
import { deliver, signedInUser, sql, userDraft } from "./support";

// J7 steps 4 and 5: Checkout (stripe-mock behind the real route), a signed
// checkout.session.completed from D2's builder, and the plan screen polling
// until the held draft is paid for, then handing it to the editor to resume.

test("the held brief resumes after a checkout completed by a signed webhook", async ({
  page,
  request,
}) => {
  const { userId } = await signedInUser(page, request);
  // The free set the guest made first, claimed at sign-in (J7).
  const free = await userDraft(userId, { performances: 1 });
  await sql`update playlist_draft set free = true where id = ${free.id}`;
  const held = await userDraft(userId, { status: "awaiting_payment" });
  // Stripe's own page is not part of the test.
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Checkout</title>",
    }),
  );
  // POST /generate is C2's and the editor E3's; until both are on main the
  // stream is the contract's example.
  const generate: unknown[] = [];
  await page.route("**/api/drafts/*/generate", (route) => {
    generate.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: JSON.stringify(streamEvent.parse(examples.streamEvent)) + "\n",
    });
  });

  await page.goto(`/plan?draft=${held.id}&plan=session_pass`);
  const pay = page.getByRole("button", { name: "Pay $2.99" });
  await expect(pay).toBeVisible();
  await expectNoAxeViolations(page);

  const checkout = page.waitForRequest("**/api/billing/checkout");
  await pay.click();
  expect(checkoutRequest.parse((await checkout).postDataJSON())).toEqual({
    plan: "session_pass",
    draftId: held.id,
  });
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);

  // Checkout's success URL; the entitlement isn't there yet.
  await page.goto(`/plan?draft=${held.id}&checkout=complete`);
  await expect(
    page.getByRole("heading", { name: "Confirming payment." }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  // The editor replaces ?run=generate once it starts, so read the URLs the
  // page passed through rather than the one it settles on.
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  await deliver(
    request,
    checkoutCompleted({ userId, draftId: held.id, plan: "session_pass" }),
  );
  await expect
    .poll(() =>
      visited.map((url) => new URL(url).pathname + new URL(url).search),
    )
    .toContain(`/d/${held.id}?run=generate`);
  const [draft] =
    await sql`select status from playlist_draft where id = ${held.id}`;
  expect(draft.status).toBe("active");
  // Once E3's editor is on main it starts generation on arrival, with no
  // input, so the server runs the brief it held.
  for (const body of generate) expect(body).not.toHaveProperty("input");
});
