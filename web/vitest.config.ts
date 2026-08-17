import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // scripts/ holds one-off migrations and backfills that write to production
    // data. They are exactly the code most worth a test and least likely to get
    // one, so they are in the suite.
    include: [
      "src/**/*.test.ts",
      "prisma/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
