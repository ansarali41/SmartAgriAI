import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / third-party: the AI service's Python virtualenv, local data
    // and npm cache.
    "services/**",
    ".data/**",
    ".npm-cache/**",
  ]),
  // simulator.js is a plain Node (CommonJS) script run with `node`.
  { files: ["simulator.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Tests build loose mocks of Prisma clients; `any` keeps them readable.
  { files: ["**/*.test.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
]);

export default eslintConfig;
