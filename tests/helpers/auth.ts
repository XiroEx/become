import { Page, BrowserContext } from '@playwright/test';

const BASE_URL = 'https://become.redbtn.io';

export async function authenticateUser(page: Page, context: BrowserContext, token: string) {
  // Set auth_token cookie so middleware/AuthGuard both see it
  await context.addCookies([{
    name: 'auth_token',
    value: token,
    domain: 'become.redbtn.io',
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  }]);

  // Set localStorage token
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
  }, token);

  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for dashboard to load — check for h1 or the daily check-in modal
  const dashboardLoaded = await page.waitForSelector('h1:has-text("Dashboard"), text="Daily Check-In"', { timeout: 15_000 }).catch(() => null);

  if (!dashboardLoaded) {
    // Retry navigation once
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('h1, .fixed', { timeout: 15_000 }).catch(() => {});
  }

  // Close daily check-in modal if it appeared
  const skipCheckIn = page.locator('button:has-text("Skip for Today")');
  if (await skipCheckIn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await skipCheckIn.click({ force: true });
    await page.waitForTimeout(300);
    // After skip, a warning confirmation overlay may appear with "Continue Anyway"
    const continueAnyway = page.locator('button:has-text("Continue Anyway")');
    if (await continueAnyway.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await continueAnyway.click({ force: true });
      await page.waitForTimeout(300);
    }
    // If the modal is still visible (warning not applicable), wait for it to close
    const modalStillOpen = page.locator('.fixed.inset-0.z-100');
    if (await modalStillOpen.isVisible({ timeout: 500 }).catch(() => false)) {
      await modalStillOpen.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
  }
}

/** Navigate away and come back — counts as one "leave + return" */
export async function leaveAndReturn(page: Page, returnTo: string) {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await page.goto(`${BASE_URL}${returnTo}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
}
