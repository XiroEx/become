import { test } from '@playwright/test';

const BASE_URL = 'https://become.redbtn.io';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTNhZGNhOTA3Mzk3OGVjODEyYjYwMWEiLCJlbWFpbCI6Imdlb3JnZTg3OTRAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NzU1ODk1MjYsImV4cCI6MTc3NjE5NDMyNn0.S-cX5DXHWV-JEd95IN8h9s6daswLbXO4MuGYqab1exQ';

test('Swap modal — inspect alternatives rendering', async ({ page, context }) => {
  // Intercept API calls
  page.on('response', async (response) => {
    if (response.url().includes('/api/exercises/alternatives')) {
      const body = await response.text().catch(() => '');
      console.log(`[API] alternatives HTTP ${response.status()}: ${body.slice(0, 200)}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[PAGE ERR]', msg.text().slice(0, 120));
  });

  await context.addCookies([{ name: 'auth_token', value: AUTH_TOKEN, domain: 'become.redbtn.io', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }]);
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), AUTH_TOKEN);

  await page.goto(`${BASE_URL}/dashboard/programming/program_jon_don_split/workout/live?day=Day%201`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15000 }).catch(() => {});

  const restartBtn = page.locator('button:has-text("Restart this day")').first();
  if (await restartBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await restartBtn.click({ force: true });
    await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 8000 }).catch(() => {});
  }

  await page.waitForTimeout(500);

  // Click "Swap Exercise" button
  const swapBtn = page.locator('button:has-text("Swap Exercise")').first();
  const found = await swapBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Swap Exercise button visible:', found);

  if (found) {
    await swapBtn.click({ force: true });
  }

  // Wait for modal + API
  await page.waitForTimeout(4000);

  // Inspect modal
  const modal = page.locator('.fixed.inset-0.z-50').first();
  const modalOpen = await modal.isVisible({ timeout: 2000 }).catch(() => false);
  console.log('Modal open:', modalOpen);

  if (modalOpen) {
    const spinner = await modal.locator('.animate-spin').isVisible({ timeout: 500 }).catch(() => false);
    console.log('Loading spinner:', spinner);

    const errEls = await modal.locator('.text-red-500, .text-red-400').all();
    for (const el of errEls) {
      console.log('Error text:', await el.textContent().catch(() => ''));
    }

    const noResultText = await modal.locator('text=No alternatives found, text=No exercises match').isVisible({ timeout: 500 }).catch(() => false);
    console.log('No-results message:', noResultText);

    // Count alternative cards
    const cards = await modal.locator('[class*="space-y-2"] > div').count();
    console.log('Alternative card count:', cards);

    // Full modal text
    const txt = await modal.textContent({ timeout: 3000 }).catch(() => '');
    console.log('Modal text (first 600):', txt?.slice(0, 600));
  }
});
