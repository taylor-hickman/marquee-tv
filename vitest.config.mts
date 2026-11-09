import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Branch thresholds sit only on code that enforces a rule (build plan 6.1).
// A glob with no files yet adds nothing until its files land.
const ruleCode = [
  "src/modules/curator/validate/**",
  "src/lib/handoff-url.ts",
  "src/lib/auth/**",
  "src/modules/billing/**",
];

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.test.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      thresholds: Object.fromEntries(
        ruleCode.map((glob) => [glob, { branches: 90 }]),
      ),
    },
  },
});
