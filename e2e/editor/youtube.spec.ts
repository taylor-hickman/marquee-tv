import { expect, test, type Page } from "@playwright/test";
import {
  draftView,
  errorBody,
  errorStatus,
  urlResponse,
  youtubeExportResponse,
} from "@/contracts";
import { examples } from "@/contracts/examples";
import { expectNoAxeViolations } from "../support/axe";
import {
  BILLIE,
  draftWith,
  MAC,
  newGuest,
  openEditor,
  trackList,
  type Guest,
} from "./support";

// J12 in the editor. The draft is real; the flag is turned to `api` in the
// draft's response, and the YouTube routes are mocked, since the export needs
// a signed-in user with a Google grant and the PR gate reaches no third party.

let guest: Guest;
let id: string;

// One draft for every test, as none of them changes it. Its guest comes from
// an address of its own (TEST-NET-3), so it doesn't count toward the ten new
// guests an hour the rest of the run shares on localhost.
test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.12" },
  });
  guest = await newGuest(request);
  id = await draftWith(request, guest, [MAC.id, BILLIE.id]);
  await request.dispose();
});

async function withApiFlag(page: Page) {
  await page.route(`**/api/drafts/${id}`, async (route) => {
    const response = await route.fetch();
    const view = draftView.parse(await response.json());
    await route.fulfill({
      response,
      json: { ...view, flags: { handoffMode: "api" } },
    });
  });
}

test("the button stays hidden while handoff_mode is url", async ({ page }) => {
  await openEditor(page, guest, `/d/${id}`);
  await expect(trackList(page).getByRole("listitem")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Save to my YouTube" }),
  ).toHaveCount(0);
});

test("without a grant, the authorization screen names the scope and sends the person to Google", async ({
  page,
}) => {
  await withApiFlag(page);
  await page.route(`**/api/drafts/${id}/youtube-export`, (route) =>
    route.fulfill({
      status: errorStatus.youtube_not_connected,
      json: errorBody.parse({ error: "youtube_not_connected" }),
    }),
  );
  await page.route("**/api/youtube/connect", (route) =>
    route.fulfill({
      json: urlResponse.parse({
        ...examples.urlResponse,
        url: "https://accounts.google.com/o/oauth2/v2/auth?state=s",
      }),
    }),
  );
  await page.route("https://accounts.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Google</title>" }),
  );
  await openEditor(page, guest, `/d/${id}`);
  await page.getByRole("button", { name: "Save to my YouTube" }).click();

  const dialog = page.getByRole("dialog", { name: "Save to my YouTube" });
  await expect(
    dialog.getByText("https://www.googleapis.com/auth/youtube"),
  ).toBeVisible();
  await expect(dialog.getByText("Account, anytime")).toBeVisible();
  await expectNoAxeViolations(page);

  await dialog.getByRole("button", { name: "Continue to Google" }).click();
  await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//);
});

test("back from Google, the editor saves and links the playlist", async ({
  page,
}) => {
  await withApiFlag(page);
  const exports: unknown[] = [];
  await page.route(`**/api/drafts/${id}/youtube-export`, (route) => {
    exports.push(route.request().postDataJSON());
    return route.fulfill({
      json: youtubeExportResponse.parse(examples.youtubeExportResponse),
    });
  });
  await openEditor(page, guest, `/d/${id}?youtube=save`);

  await expect(
    page.getByRole("link", { name: "Open in YouTube" }),
  ).toHaveAttribute(
    "href",
    "https://www.youtube.com/playlist?list=PLm3xQ8vK1wZ0pR7nYc2bLg",
  );
  expect(exports).toEqual([{ baseRevision: 1 }]);
  await expect(page).toHaveURL(new RegExp(`/d/${id}$`));
});
