import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '../playwright-report', open: 'never' }]],
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
      name: 'swap-mobile',
      testMatch: '**/swap-debug.spec.ts',
      timeout: 120_000,
      use: {
        ...devices['Pixel 7'],
        video: 'off',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
    {
      name: 'live-workout',
      testMatch: '**/live-workout-completability.spec.ts',
      timeout: 300_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        video: 'off',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
    {
      name: 'new-user-journey',
      testMatch: '**/new-user-journey.spec.ts',
      timeout: 300_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        video: 'off',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
    {
      name: 'nutrition',
      testMatch: '**/nutrition.spec.ts',
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        video: 'off',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
    {
      name: 'barcode',
      testMatch: '**/barcode.spec.ts',
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        video: 'off',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
  ],
});
