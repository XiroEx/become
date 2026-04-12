/**
 * Swap Modal Debug Test
 *
 * Auth: Permanent JWT generated at runtime from JWT_SECRET (no expiry — never needs updating).
 * Requires webapp/.env.local with JWT_SECRET set.
 */

import { test, expect } from '@playwright/test';
import { BASE_URL, AUTH_TOKEN } from './test-auth';

const SCREENSHOT_PATH = '/tmp/swap-modal-mobile.png';

test('Swap modal — mobile screenshot', async ({ page, context }) => {
  await context.addCookies([{
    name: 'auth_token', value: AUTH_TOKEN,
    domain: new URL(BASE_URL).hostname, path: '/',
    httpOnly: false, secure: true, sameSite: 'Lax',
  }]);
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), AUTH_TOKEN);

  await page.goto(`${BASE_URL}/dashboard/programming/program_jon_don_split/workout/live?day=Day%201`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15000 }).catch(() => {});

  // Handle restart modal
  const restartBtn = page.locator('button:has-text("Restart this day")').first();
  if (await restartBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await restartBtn.click({ force: true });
    await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(800);

  // Open swap modal
  const swapBtn = page.locator('button:has-text("Swap Exercise")').first();
  await expect(swapBtn).toBeVisible({ timeout: 8000 });
  await swapBtn.click({ force: true });

  // Wait for alternatives to load (spinner gone, alternatives appear)
  await page.waitForFunction(() => {
    const modal = document.querySelector('.fixed.inset-0.z-50');
    if (!modal) return false;
    const spinner = modal.querySelector('.animate-spin');
    return !spinner;
  }, { timeout: 12000 }).catch(() => {});

  await page.waitForTimeout(500);

  // Screenshot of the open modal
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  console.log(`Screenshot saved: ${SCREENSHOT_PATH}`);

  // Log modal text for verification
  const modalTxt = await page.locator('.fixed.inset-0.z-50').first().textContent({ timeout: 3000 }).catch(() => '');
  console.log('Modal content:', modalTxt?.slice(0, 400));
});
