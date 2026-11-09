import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Architecture 3: modules import each other only through index.ts, and
// curator never reaches Postgres. A module's testing.ts (build plan 6.2) is
// the one other entry point.
const modules = ["catalog", "curator", "playlist", "billing", "events"];

const throughIndex = {
  regex: "^@/modules/[^/]+/(?!testing$)",
  message: "Import another module through its index: @/modules/<name>.",
};

const boundaries = (module) => {
  const others = modules.filter((m) => m !== module).join("|");
  const patterns = [
    throughIndex,
    {
      regex: `^(\\.\\./)+(${others})(/|$)`,
      message: "Import another module through its index: @/modules/<name>.",
    },
  ];
  if (module === "curator") {
    patterns.push({
      regex: "(^|/)lib/db(/|$)",
      message: "curator never runs SQL; read through @/modules/catalog.",
    });
  }
  return {
    files: [`src/modules/${module}/**`],
    rules: { "no-restricted-imports": ["error", { patterns }] },
  };
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [throughIndex] }],
    },
  },
  ...modules.map(boundaries),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/.temp/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
