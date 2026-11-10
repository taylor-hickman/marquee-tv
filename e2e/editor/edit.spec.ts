import { expect, test, type Page } from "@playwright/test";
import { replaceOptionsResponse } from "@/contracts";
import { examples } from "@/contracts/examples";
import { expectNoAxeViolations } from "../support/axe";
import {
  BILLIE,
  draftWith,
  JAPANESE_BREAKFAST,
  MAC,
  MITSKI,
  newGuest,
  openEditor,
  readDraft,
  row,
  trackList,
  TYLER,
  writeOps,
  type Guest,
} from "./support";

// J2 against the seeded catalog and the real /ops and /undo routes. Each test
// opens a hand-built draft of Mac Miller, Tyler and Billie Eilish (1 h 5 m).

let guest: Guest;
let id: string;

test.beforeAll(async ({ request }) => {
  guest = await newGuest(request);
});

test.beforeEach(async ({ page, request }) => {
  id = await draftWith(request, guest, [MAC.id, TYLER.id, BILLIE.id]);
  await openEditor(page, guest, `/d/${id}`);
  await expect(trackList(page).getByRole("listitem")).toHaveCount(3);
});

// Rows top to bottom, by artist: each row reads its position, then the artist.
const expectOrder = (page: Page, names: string[]) =>
  expect(trackList(page).getByRole("listitem")).toHaveText(
    names.map((name) => new RegExp(`^\\d+${name}`)),
  );

test("pin marks the row and turns the button to Unpin", async ({
  page,
  request,
}) => {
  await row(page, TYLER.name).getByRole("button", { name: "Pin" }).click();
  await expect(
    row(page, TYLER.name).getByRole("button", { name: "Unpin" }),
  ).toBeVisible();
  const draft = await readDraft(request, guest, id);
  expect(draft.revision?.items[1]).toMatchObject({
    performance_id: TYLER.id,
    pinned: "position",
  });
  await expectNoAxeViolations(page);

  await row(page, TYLER.name).getByRole("button", { name: "Unpin" }).click();
  await expect(
    row(page, TYLER.name).getByRole("button", { name: "Pin" }),
  ).toBeVisible();
});

test("remove drops the row and updates the runtime", async ({
  page,
  request,
}) => {
  await expect(page.getByText("1 h 5 m")).toBeVisible();
  await row(page, TYLER.name).getByRole("button", { name: "Remove" }).click();
  await expectOrder(page, [MAC.name, BILLIE.name]);
  await expect(page.getByText("41 m")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "2 performances" }),
  ).toBeVisible();
  const draft = await readDraft(request, guest, id);
  expect(draft.revision?.removedIds).toEqual([TYLER.id]);
});

test("keyboard reorder: Move down and Move up keep focus on the moved row", async ({
  page,
  request,
}) => {
  await row(page, MAC.name).getByRole("button", { name: "Move down" }).focus();
  await page.keyboard.press("Enter");
  await expectOrder(page, [TYLER.name, MAC.name, BILLIE.name]);

  // Focus stays on the moved row, so the next press moves it again.
  await expect(
    row(page, MAC.name).getByRole("button", { name: "Move down" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expectOrder(page, [TYLER.name, BILLIE.name, MAC.name]);

  // At the bottom Move down is disabled, so Move up takes focus.
  await expect(
    row(page, MAC.name).getByRole("button", { name: "Move up" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expectOrder(page, [TYLER.name, MAC.name, BILLIE.name]);

  const draft = await readDraft(request, guest, id);
  expect(draft.revision?.items.map((i) => i.performance_id)).toEqual([
    TYLER.id,
    MAC.id,
    BILLIE.id,
  ]);
  // Moving a row by hand pins it where it was put (PRD 7.4).
  expect(draft.revision?.items[1].pinned).toBe("position");
});

test("drag puts a row where it is dropped", async ({ page }) => {
  await row(page, BILLIE.name)
    .locator("[draggable=true]")
    .dragTo(row(page, MAC.name));
  await expectOrder(page, [BILLIE.name, MAC.name, TYLER.name]);
});

test("replace offers alternatives from /replace-options and swaps the row", async ({
  page,
  request,
}) => {
  const alternatives = [JAPANESE_BREAKFAST, MITSKI].map((p) => ({
    ...examples.performanceCard,
    id: p.id,
    title: null,
    artists: [{ id: p.id, name: p.name }],
    durationS: p.durationS,
  }));
  // C2 owns the route; the mock keeps to its contract.
  await page.route(`**/api/drafts/${id}/replace-options?index=1`, (route) =>
    route.fulfill({
      json: replaceOptionsResponse.parse({ options: alternatives }),
    }),
  );

  await row(page, TYLER.name).getByRole("button", { name: "Replace" }).click();
  const sheet = page.getByRole("dialog", { name: `Replace ${TYLER.name}` });
  await expect(sheet.getByRole("button", { name: /Mitski/ })).toBeVisible();
  await expectNoAxeViolations(page);

  await sheet.getByRole("button", { name: /Mitski/ }).click();
  await expect(sheet).toBeHidden();
  await expectOrder(page, [MAC.name, MITSKI.name, BILLIE.name]);
  const draft = await readDraft(request, guest, id);
  expect(draft.revision?.items[1]).toMatchObject({
    performance_id: MITSKI.id,
    source: "manual",
  });
  expect(draft.revision?.removedIds).toEqual([TYLER.id]);
});

test("undo restores the list before the last edit", async ({
  page,
  request,
}) => {
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await row(page, TYLER.name).getByRole("button", { name: "Remove" }).click();
  await expectOrder(page, [MAC.name, BILLIE.name]);

  await page.getByRole("button", { name: "Undo" }).click();
  await expectOrder(page, [MAC.name, TYLER.name, BILLIE.name]);
  const draft = await readDraft(request, guest, id);
  expect(draft.revision).toMatchObject({ number: 3, trigger: "undo" });
  expect(draft.revision?.removedIds).toEqual([]);
});

test("409: a write from another tab wins and the editor re-renders it", async ({
  page,
  request,
}) => {
  // Another tab removes Tyler, so this page's revision is stale.
  await writeOps(request, guest, id, 1, [
    { op: "remove", performance_id: TYLER.id },
  ]);

  const conflict = page.waitForResponse(
    (r) => r.url().endsWith(`/api/drafts/${id}/ops`) && r.status() === 409,
  );
  await row(page, BILLIE.name).getByRole("button", { name: "Pin" }).click();
  await conflict;
  await expectOrder(page, [MAC.name, BILLIE.name]);
  await expect(page.getByRole("status")).toHaveText(
    "This set changed elsewhere. Showing the latest.",
  );
  // The stale pin was refused; nothing was written over the other tab's list.
  await expect(
    row(page, BILLIE.name).getByRole("button", { name: "Pin" }),
  ).toBeVisible();
  const draft = await readDraft(request, guest, id);
  expect(draft.revision?.number).toBe(2);
});

test("rename saves the title and description", async ({ page, request }) => {
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Backyard set");
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("Loose and sunny");
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Backyard set" }),
  ).toBeVisible();
  await expect(page.getByText("Loose and sunny")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename" })).toBeFocused();
  const draft = await readDraft(request, guest, id);
  expect(draft.draft).toMatchObject({
    title: "Backyard set",
    description: "Loose and sunny",
  });
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`screen-reader order matches visual order on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const rows = trackList(page).getByRole("listitem");
    // The accessibility tree reads rows in DOM order; the screen shows them
    // top to bottom in the same order, with each row's controls after it.
    await expectOrder(page, [MAC.name, TYLER.name, BILLIE.name]);
    const tops = await rows.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().top),
    );
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    // Tab order through the rows' links and buttons reads like the screen:
    // down the page, and left to right along a line.
    const centres = await trackList(page)
      .locator("a, button")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }),
      );
    for (const [i, b] of centres.entries()) {
      const a = centres[i - 1];
      if (!a) continue;
      const sameLine = Math.abs(b.y - a.y) < 12;
      expect(sameLine ? b.x > a.x : b.y > a.y).toBe(true);
    }
    await expectNoAxeViolations(page);
  });
}
