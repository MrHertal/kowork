import { defineConfig, devices } from "@playwright/test";

const appPort = 4173;
const serverPort = 4096;
const baseURL = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
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
      VITE_OPENCODE_SERVER_HOST: "127.0.0.1",
      VITE_OPENCODE_SERVER_PORT: String(serverPort),
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
