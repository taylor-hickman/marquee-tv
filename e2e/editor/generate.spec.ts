import { expect, test, type Page } from "@playwright/test";
import {
  errorBody,
  errorStatus,
  eventsRequest,
  generateRequest,
  type BriefInput,
  type GenerateRequest,
  type StreamEvent,
} from "@/contracts";
import { expectNoAxeViolations } from "../support/axe";
import {
  BILLIE,
  briefEcho,
  createDraft,
  draftWith,
  MAC,
  newGuest,
  openEditor,
  started,
  stream,
  trackList,
  TYLER,
  writeOps,
  type Guest,
} from "./support";

// Runs started from the editor. POST /generate belongs to C2 and isn't merged,
// so each test mocks it with a stream built from the contract. A result
// carries the draft as the real /ops route wrote it, so the editor renders
// server state and later edits still work.

let guest: Guest;

test.beforeAll(async ({ request }) => {
  guest = await newGuest(request);
});

const input: BriefInput = {
  text: "Friends over for dinner. Start mellow, get groovier as it goes.",
  mood: "dinner_party",
  durationS: 7200,
  seeds: [],
};

// Answers each POST /generate with the next script; a script that ends in
// `result` gets the list the curator would have written.
async function mockGenerate(
  page: Page,
  id: string,
  scripts: ((base: number | null) => Promise<StreamEvent[]>)[],
) {
  const bodies: GenerateRequest[] = [];
  await page.route(`**/api/drafts/${id}/generate`, async (route) => {
    const body = generateRequest.parse(route.request().postDataJSON());
    bodies.push(body);
    const script = scripts[bodies.length - 1];
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: stream(await script(body.baseRevision)),
    });
  });
  return bodies;
}

test("a pending brief starts generate on arrival and the result renders", async ({
  page,
  request,
}) => {
  const id = await createDraft(request, guest, {
    creationMethod: "chip",
    input,
  });
  const bodies = await mockGenerate(page, id, [
    async (base) => {
      const draft = await writeOps(request, guest, id, base, [
        { op: "add", performance_id: MAC.id },
        { op: "add", performance_id: TYLER.id },
        { op: "add", performance_id: BILLIE.id },
        { op: "rename", title: "Slow burn", description: "Mellow to groovy" },
      ]);
      return [
        started,
        briefEcho("2 h · starts mellow"),
        { type: "candidates", count: 120 },
        { type: "result", draft, warnings: [] },
      ];
    },
  ]);
  await page.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
    [`pending_brief:${id}`, JSON.stringify(input)],
  );
  await openEditor(page, guest, `/d/${id}`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Slow burn" }),
  ).toBeVisible();
  await expect(trackList(page).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("1 h 5 m")).toBeVisible();
  await expect(page.getByText("/ 2 h")).toBeVisible();
  expect(bodies).toEqual([{ baseRevision: null, mode: "generate", input }]);
  await expectNoAxeViolations(page);
});

test("progress shows the brief echo and steps; a failed run keeps the brief for Try again", async ({
  page,
  request,
}) => {
  const id = await createDraft(request, guest, {
    creationMethod: "chip",
    input,
  });
  const bodies = await mockGenerate(page, id, [
    async () => [
      started,
      briefEcho("2 h · starts mellow"),
      { type: "error", code: "generation_failed" },
    ],
    async (base) => {
      const draft = await writeOps(request, guest, id, base, [
        { op: "add", performance_id: MAC.id },
      ]);
      return [started, { type: "result", draft, warnings: [] }];
    },
  ]);
  await page.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
    [`pending_brief:${id}`, JSON.stringify(input)],
  );
  await openEditor(page, guest, `/d/${id}`);

  await expect(
    page.getByRole("heading", { level: 1, name: `“${input.text}”` }),
  ).toBeVisible();
  await expect(page.getByText("2 h · starts mellow")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Progress" }).getByRole("listitem"),
  ).toHaveText(["DoneBrief", "FailedSearch", "NextArc"]);
  await expect(
    page.getByRole("alert").filter({ hasText: "Nothing is lost." }),
  ).toContainText("We couldn't reach the catalog.");
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(trackList(page).getByRole("listitem")).toHaveCount(1);
  expect(bodies).toEqual([
    { baseRevision: null, mode: "generate", input },
    { baseRevision: null, mode: "generate", input },
  ]);
});

test("?run=fill starts fill on the picks and records brief_submitted", async ({
  page,
  request,
}) => {
  const id = await draftWith(request, guest, [MAC.id, BILLIE.id]);
  const bodies = await mockGenerate(page, id, [
    async (base) => {
      const draft = await writeOps(request, guest, id, base, [
        { op: "add", performance_id: TYLER.id, index: 1 },
      ]);
      return [started, { type: "result", draft, warnings: [] }];
    },
  ]);
  const submitted = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/events") &&
      eventsRequest.parse(r.postDataJSON()).name === "brief_submitted",
  );
  await openEditor(page, guest, `/d/${id}?run=fill`);

  expect(eventsRequest.parse((await submitted).postDataJSON())).toEqual({
    name: "brief_submitted",
    draftId: id,
    props: { entry: "manual_fill" },
  });
  await expect(trackList(page).getByRole("listitem")).toHaveText([
    /Mac Miller/,
    /Tyler/,
    /Billie Eilish/,
  ]);
  // A reload opens the set without starting another run.
  await expect(page).toHaveURL(`/d/${id}`);
  expect(bodies).toEqual([{ baseRevision: 1, mode: "fill" }]);
});

test("regenerate unpinned sends the current revision and renders the result", async ({
  page,
  request,
}) => {
  const id = await draftWith(request, guest, [MAC.id, BILLIE.id]);
  const bodies = await mockGenerate(page, id, [
    async (base) => {
      const draft = await writeOps(request, guest, id, base, [
        {
          op: "replace",
          performance_id: BILLIE.id,
          with_performance_id: TYLER.id,
        },
      ]);
      return [started, { type: "result", draft, warnings: [] }];
    },
  ]);
  await openEditor(page, guest, `/d/${id}`);
  await expect(trackList(page).getByRole("listitem")).toHaveCount(2);

  const regenerated = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/events") &&
      eventsRequest.parse(r.postDataJSON()).name === "regenerated_all",
  );
  await page.getByRole("button", { name: "Regenerate unpinned" }).click();
  await expect(trackList(page).getByRole("listitem")).toHaveText([
    /Mac Miller/,
    /Tyler/,
  ]);
  await regenerated;
  expect(bodies).toEqual([{ baseRevision: 1, mode: "regenerate" }]);
});

test("?run=generate runs the brief the server held, with no input", async ({
  page,
  request,
}) => {
  const id = await createDraft(request, guest, {
    creationMethod: "typed",
    input,
  });
  const bodies = await mockGenerate(page, id, [
    async (base) => {
      const draft = await writeOps(request, guest, id, base, [
        { op: "add", performance_id: MAC.id },
      ]);
      return [started, { type: "result", draft, warnings: [] }];
    },
  ]);
  await openEditor(page, guest, `/d/${id}?run=generate`);

  await expect(trackList(page).getByRole("listitem")).toHaveCount(1);
  await expect(page).toHaveURL(`/d/${id}`);
  expect(bodies).toEqual([{ baseRevision: null, mode: "generate" }]);
});

test("a run refused for payment opens the plan screen on the default plan", async ({
  page,
  request,
}) => {
  const id = await createDraft(request, guest, {
    creationMethod: "typed",
    input,
  });
  await page.route(`**/api/drafts/${id}/generate`, (route) =>
    route.fulfill({
      status: errorStatus.payment_required,
      json: errorBody.parse({
        error: "payment_required",
        defaultPlan: "subscription",
      }),
    }),
  );
  await page.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
    [`pending_brief:${id}`, JSON.stringify(input)],
  );
  await openEditor(page, guest, `/d/${id}`);

  await expect(page).toHaveURL(`/plan?draft=${id}&plan=subscription`);
});
