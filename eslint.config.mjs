import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".vercel/**",
    "next-env.d.ts",
    ".data/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    ".tools/**",
    "verifier/build/**",
    ".agents/skills/neon/**",
    ".agents/skills/neon-postgres/**",
  ]),
]);
