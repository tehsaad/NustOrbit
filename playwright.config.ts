import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

const PORT = 3100;
const TEST_URL = "postgresql://postgres:password@localhost:54329/orbit_test";
export const SETUP_TOKEN = "e2e-setup-token-0123456789abcdef";

const env = {
  DATABASE_URL: TEST_URL,
  DATABASE_URL_UNPOOLED: TEST_URL,
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  ORBIT_VAULT_KEY: randomBytes(32).toString("base64"),
  CRON_SECRET: randomBytes(32).toString("base64url"),
  SETUP_TOKEN,
  ORBIT_TIMEZONE: "Asia/Karachi",
  PORT: String(PORT),
  AUTH_SIGNIN_RATE_MAX: "100",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/, dependencies: ["desktop"] },
  ],
  webServer: [
    { command: "node tests/support/start-db.mjs", port: 54329, reuseExistingServer: false, timeout: 120_000, stdout: "ignore" },
    { command: `npx next build && npx next start -p ${PORT}`, url: `http://localhost:${PORT}/api/health`, reuseExistingServer: false, timeout: 300_000, env },
  ],
});
