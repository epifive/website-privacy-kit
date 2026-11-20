import path from "node:path";
import { defineConfig } from "vitest/config";

// End-to-end tests (headless Chrome over CDP against `next start`). Run `npm run build` first.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
