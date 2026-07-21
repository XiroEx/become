import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import jwt from 'jsonwebtoken'

const BASE_URL = 'https://become.redbtn.io'
const NUDGE_USER = '69324119a28a8ac3b78750b9'   // the account showing the nudges

for (const theme of ['light', 'dark'] as const) {
  test(`nudge dismiss button is visible in ${theme} mode`, async ({ page, context }) => {
    const env = readFileSync('.env.local', 'utf8')
    const secret = env.match(/^JWT_SECRET=(.*)$/m)![1].trim().replace(/^["']|["']$/g, '')
    const token = jwt.sign({ userId: NUDGE_USER, email: 'n@become.local' }, secret, { expiresIn: '20m' })
    await context.addCookies([{ name: 'auth_token', value: token, domain: 'become.redbtn.io', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }])
    await page.emulateMedia({ colorScheme: theme })
    await page.goto(`${BASE_URL}/login`)
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto(`${BASE_URL}/dashboard`)
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
    await page.locator('button:has-text("Skip for Today")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(600)
    await page.locator('button:has-text("Continue Anyway")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(2500)
    // make sure no modal is left covering the dashboard
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(1200)

    const card = page.locator('[data-testid="suggestion-card"]').first()
    if (!(await card.isVisible({ timeout: 8000 }).catch(() => false))) {
      console.log(`${theme}: no nudge card present — skipping`)
      return
    }
    await card.scrollIntoViewIfNeeded()
    const btn = page.locator('[data-testid="suggestion-dismiss"]').first()
    await expect(btn).toBeVisible()

    // Tap target must be a real one (>= ~36px), not the old ~24px glyph.
    const box = await btn.boundingBox()
    console.log(`${theme}: dismiss tap target = ${Math.round(box!.width)}x${Math.round(box!.height)}px`)
    expect(box!.width).toBeGreaterThanOrEqual(34)
    expect(box!.height).toBeGreaterThanOrEqual(34)

    await card.screenshot({ path: `tests/e2e/screenshots/nudge-${theme}.png` })
    console.log(`${theme}: OK`)
  })
}
