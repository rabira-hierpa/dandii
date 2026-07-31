import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Enterprise standards (web/CLAUDE.md) enforced on our own source. Generated
  // code (src/generated) is ignored below; vendored UI (base/, application/) is
  // relaxed in the override that follows.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { sonarjs },
    rules: {
      // Rule 3: ban parent-relative (../) import STRINGS; use the @/ alias.
      // (no-restricted-imports checks the source string, not the resolved path.)
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./",
              message:
                "Use the @/ alias instead of parent-relative (../) imports (web/CLAUDE.md Rule 3).",
            },
          ],
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error", // Rule 3: import type
      "@typescript-eslint/no-explicit-any": "error", // Rule 5: no any
      "sonarjs/cognitive-complexity": ["warn", 15], // Rule 4: keep functions simple
    },
  },
  {
    // Vendored Untitled UI components — not held to our import/type rules.
    files: [
      "src/components/base/**/*.{ts,tsx}",
      "src/components/application/**/*.{ts,tsx}",
    ],
    rules: {
      "@next/next/no-img-element": "off",
      "no-restricted-imports": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "sonarjs/cognitive-complexity": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma-generated client — not our code to lint.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
