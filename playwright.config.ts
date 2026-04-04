import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  retries: 1,
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'https://become.redbtn.io',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'desktop',
      testMatch: '**/desktop.spec.ts',
      timeout: 600_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        video: 'off',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
    {
      name: 'mobile-1',
      testMatch: '**/mobile1.spec.ts',
      timeout: 600_000,
      use: { ...devices['iPhone 14'], video: 'off', trace: 'off' },
    },
    {
      name: 'mobile-2',
      testMatch: '**/mobile2.spec.ts',
      timeout: 600_000,
      use: { ...devices['iPhone 14'], video: 'off', trace: 'off' },
    },
    {
      name: 'mobile-3',
      testMatch: '**/mobile3.spec.ts',
      timeout: 600_000,
      use: { ...devices['iPhone 14'], video: 'off', trace: 'off' },
    },
  ],
});
