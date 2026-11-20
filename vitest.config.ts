import path from "node:path";
import { defineConfig } from "vitest/config";

// Run with --maxWorkers=1 on the low-RAM build machine (see package.json "test").
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js marker module; a no-op outside the Next bundler.
      "server-only": path.resolve(__dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Browser end-to-end tests need a production build: `npm run test:e2e` (vitest.e2e.config.ts).
    exclude: ["tests/e2e/**", "node_modules/**"],
    pool: "forks",
    // MySQL (WPK_TEST_MYSQL_URL): every test file migrates a fresh database over the network (~10 s).
    testTimeout: process.env.WPK_TEST_MYSQL_URL ? 60_000 : 20_000,
    hookTimeout: process.env.WPK_TEST_MYSQL_URL ? 180_000 : 10_000,
  },
});
