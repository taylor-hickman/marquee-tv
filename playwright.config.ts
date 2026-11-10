import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import { WEBHOOK_SECRET } from "./src/modules/billing/testing";

// PLAYWRIGHT_BASE_URL points the run at a deploy (a preview, or staging for
// the live project) instead of a local production build.
const deployed = process.env.PLAYWRIGHT_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

// A local run serves the app against the local stack's Auth and Postgres,
// stripe-mock and the fake model (build plan 6.1). Stripe keys and prices are
// placeholders stripe-mock accepts; webhooks are signed with D2's test secret.
function localServerEnv(): Record<string, string> {
  const stack = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  return {
    DATABASE_URL: process.env.DATABASE_URL ?? stack.DB_URL,
    NEXT_PUBLIC_SUPABASE_URL: stack.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stack.PUBLISHABLE_KEY,
    LLM_ADAPTER: "fake",
    STRIPE_API_BASE: process.env.STRIPE_API_BASE ?? "http://localhost:12111",
    STRIPE_SECRET_KEY: "sk_test_marquee",
    STRIPE_PRICE_PASS: "price_marquee_pass",
    STRIPE_PRICE_MONTHLY: "price_marquee_monthly",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };
}

export default defineConfig({
  testDir: "e2e",
  // A deploy has its own database; only a local run resets the local stack.
  globalSetup: deployed ? undefined : "./e2e/support/db.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // A spec that passes only on retry fails the run (build plan 6.1).
  failOnFlakyTests: !!process.env.CI,
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
        env: localServerEnv(),
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
