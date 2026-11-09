import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_BASE_URL points the run at a deploy (a preview, or staging for
// the live project) instead of a local production build.
const deployed = process.env.PLAYWRIGHT_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "e2e",
  // A deploy has its own database; only a local run resets the local stack.
  globalSetup: deployed ? undefined : "./e2e/support/db.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: deployed ?? "http://localhost:3000",
    trace: "on-first-retry",
    extraHTTPHeaders: bypass
      ? { "x-vercel-protection-bypass": bypass }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "journeys/**",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "live",
      testMatch: "journeys/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: deployed
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
