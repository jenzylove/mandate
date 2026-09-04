import { defineConfig } from "@playwright/test";

// The E2E suite drives a real browser against a real dev server, which in turn
// talks to real agents and a real chain. Timeouts are generous because escrow
// settlement genuinely takes minutes.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
  },
});
