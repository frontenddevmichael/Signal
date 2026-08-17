import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  // Serial-only: every spec signs in as the same shared dev account against
  // one local deployment, and several specs assert exact row counts. Parallel
  // workers race the shared session and the shared data — the suite has
  // always been run with --workers=1; lock that in so a bare `npx playwright
  // test` can't silently false-fail.
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
