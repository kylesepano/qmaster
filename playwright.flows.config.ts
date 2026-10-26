import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "ui-flows.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/flows",
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "https://qmastertest.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only_for_ui_tests",
    },
  },
});
