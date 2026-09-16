import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load dedicated E2E environment variables (override any already-set vars from .env)
dotenv.config({ path: path.resolve(__dirname, '.env.e2e'), override: true });

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx next dev -p 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      ...process.env,
      PORT: '3000',
      E2E_TEST_MODE: 'true',
      DATABASE_URL: process.env.DATABASE_URL!,
      DIRECT_URL: process.env.DIRECT_URL!,
      E2E_ALLOWED_DB_HOSTS: process.env.E2E_ALLOWED_DB_HOSTS || 'ep-aged-wind',
      AUTH_SECRET: process.env.AUTH_SECRET || 'supersecret_min_32_chars_random_string_here',
    },
  },
});
