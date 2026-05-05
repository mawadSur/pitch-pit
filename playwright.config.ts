import { defineConfig, devices } from "@playwright/test";

const PORT = 3100; // Off-by-one from dev (3000) and the Next prod default (3000)
const LOCAL_BASE_URL = `http://localhost:${PORT}`;
// Set E2E_BASE_URL=https://pitchpit.app to point the suite at a deployed
// environment. When set, the local webServer is skipped.
const REMOTE_BASE_URL = process.env.E2E_BASE_URL;
const BASE_URL = REMOTE_BASE_URL ?? LOCAL_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // Bail in CI; locally we want to see all failures.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Boots the Next prod server before tests so we exercise the actual built
  // bundle, not the dev-mode HMR shim. `reuseExistingServer` lets you `npm run
  // dev` in another terminal during local iteration without conflict. Skip
  // entirely when E2E_BASE_URL is set — we're running against a deployed env.
  ...(REMOTE_BASE_URL
    ? {}
    : {
        webServer: {
          command: `npm run build && npm start -- --port ${PORT}`,
          url: LOCAL_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
});
