import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // node, not jsdom — it is much faster and almost every test here is a pure
    // function. Component tests opt in per file with a
    // `// @vitest-environment jsdom` docblock rather than making the whole
    // suite pay for a DOM.
    environment: "node",
    // scripts/ holds one-off migrations and backfills that write to production
    // data. They are exactly the code most worth a test and least likely to get
    // one, so they are in the suite.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "prisma/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
