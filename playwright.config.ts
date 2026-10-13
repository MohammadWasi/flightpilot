import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// Deliberately public, test-only credentials. This server is isolated from local app data.
const testToken = 'flightpilot-e2e-only-token-0000000000000000';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 1000 } } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          FLIGHTPILOT_MODE: 'simulation',
          FLIGHTPILOT_BASE_URL: baseURL,
          FLIGHTPILOT_API_TOKEN: testToken,
          FLIGHTPILOT_ENCRYPTION_KEY: '0'.repeat(64),
          FLIGHTPILOT_DATA_DIR: resolve('.data-e2e'),
          DATABASE_URL: '',
        },
      },
});
