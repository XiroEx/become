// The adaptive session card is the headline on every Mind system, and the old
// "Personalize with AI" button is gone.
//
// This spec used to hardcode https://become.redbtn.io AND a third real member's
// id (69324119a28a8ac3b78750b9), minting a token for them by reading JWT_SECRET
// straight out of .env.local. It needed none of that: the headline is
// unconditional markup in components/mind/system/SystemDashboard.tsx, so it
// renders for any authenticated member. It now runs as the dedicated e2e
// account against whatever base URL the run is pointed at.
import { test, expect } from '@playwright/test'
import { BASE_URL, E2E_AUTH_TOKEN } from './test-auth'

const SYSTEMS = ['state-shift', 'discipline', 'anti-sabotage', 'self-image'] as const

test('adaptive session is the headline across all 4 systems', async ({ page, context }) => {
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push('PAGEERR ' + String(e).slice(0, 120)))

  await context.addCookies([{
    name: 'auth_token',
    value: E2E_AUTH_TOKEN,
    domain: new URL(BASE_URL).hostname,
    path: '/',
    httpOnly: false,
    secure: BASE_URL.startsWith('https'),
    sameSite: 'Lax',
  }])
  await page.goto(`${BASE_URL}/login`)
  await page.evaluate((t) => localStorage.setItem('token', t), E2E_AUTH_TOKEN)

  for (const sec of SYSTEMS) {
    await page.goto(`${BASE_URL}/dashboard/mind/${sec}`, { waitUntil: 'domcontentloaded' })
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(2200)
    const headline = page.locator('text=/Today.?s session . built for you/i').first()
    const present = await headline.isVisible().catch(() => false)
    const oldBtn = await page.locator('button:has-text("Personalize with AI")').count()
    console.log(`${sec}: adaptive headline=${present}  old "Personalize" button=${oldBtn}`)
    expect(present).toBe(true)
    expect(oldBtn).toBe(0)
  }

  await page.goto(`${BASE_URL}/dashboard/mind/state-shift`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  await page.screenshot({ path: 'tests/e2e/screenshots/adaptive-headline.png', fullPage: true })
  console.log('ERRORS:', errs.length ? JSON.stringify(errs) : 'none')
  expect(errs).toEqual([])
})
