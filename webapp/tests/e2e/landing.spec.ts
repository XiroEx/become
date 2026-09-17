import { expect, test } from '@playwright/test'
import fs from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3210'
const SHOTS = '/tmp/become-landing-shots'

test.describe('public landing page', () => {
  test('mobile tells the whole product story without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Who are you becoming?' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Start your line/i })).toHaveAttribute('href', '/register')

    await page.getByRole('tab', { name: /Fuel/i }).click()
    await expect(page.getByRole('heading', { name: 'Eat with context, not guilt.' })).toBeVisible()
    await page.getByRole('tab', { name: /Training/i }).click()
    await expect(page.getByRole('heading', { name: 'Make every session answer the last.' })).toBeVisible()

    await page.getByRole('button', { name: 'Open Week 01' }).click()
    await expect(page.getByRole('heading', { name: 'You began before you felt ready.' })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    fs.mkdirSync(SHOTS, { recursive: true })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${SHOTS}/mobile.png`, fullPage: true })
  })

  test('desktop has the Becoming line and honors reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })

    await expect(page.getByText('Most apps tell you what you did.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your weeks become evidence.' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Begin becoming/i })).toHaveAttribute('href', '/register')

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    fs.mkdirSync(SHOTS, { recursive: true })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${SHOTS}/desktop.png`, fullPage: true })
  })
})
