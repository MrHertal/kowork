// @opencode-ref: opencode/packages/app/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const appPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${appPort}`;
const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1";
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096";
const workers =
  Number(process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? 1 : 0)) ||
  undefined;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: process.env.PLAYWRIGHT_FULLY_PARALLEL === "1",
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers,
  reporter: [
    ["html", { outputFolder: "e2e/playwright-report", open: "never" }],
    ["line"],
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${appPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_OPENCODE_SERVER_HOST: serverHost,
      VITE_OPENCODE_SERVER_PORT: serverPort,
    },
  },
  use: {
    baseURL,
    locale: "en-US",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
