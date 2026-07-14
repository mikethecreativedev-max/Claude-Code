import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Every test file runs against the same real Postgres database (see
    // tests/tenant-isolation.test.ts and its siblings) and some tests
    // assert on global table counts (e.g. "sign-up creates exactly one
    // DPA row"). Running test files in parallel workers lets one file's
    // writes land inside another file's before/after count window,
    // producing flaky, order-dependent failures — not a bug in the code
    // under test. Serializing file execution trades a bit of wall-clock
    // time for that never happening.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
