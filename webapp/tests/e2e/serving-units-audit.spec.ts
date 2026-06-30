import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

// Diagnostic: drive the estimate flow and, for EVERY item, walk EVERY serving
// option — recording the resulting calories so we can see which units are
// broken / nonsensical and whether the friendly serving persists.
test('audit serving units on estimate rows', async ({ page, context }) => {
  test.setTimeout(200_000)
  await authenticate(page, context)
  await page.goto(`${BASE_URL}/dashboard/nutrition`)
  await page.waitForLoadState('domcontentloaded')

  await page.locator('button:has-text("Search foods")').first().click()
  const textarea = page.locator('textarea[placeholder*="describe"], textarea[placeholder*="Search or describe"]').first()
  await textarea.waitFor({ state: 'visible', timeout: 15000 })
  await textarea.fill('a Mason Dixie breakfast sandwich, a cup of blueberries, and a kiwi')
  await page.locator('button[aria-label="Describe this meal to estimate macros"]').click()
  const estimateBtn = page.locator('button:has-text("Estimate")').first()
  await estimateBtn.waitFor({ state: 'visible', timeout: 15000 })
  await estimateBtn.click()

  await expect(page.getByText('Serving Size').first()).toBeVisible({ timeout: 120_000 })
  await page.waitForTimeout(1500)

  const selects = page.locator('select[aria-label="Serving size"]')
  const cardCount = await selects.count()
  console.log(`AUDIT: ${cardCount} item cards`)

  const report: any[] = []
  for (let i = 0; i < cardCount; i++) {
    const sel = selects.nth(i)
    const card = sel.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    const name = (await card.locator('span').first().innerText().catch(() => '?')).trim()
    const calOf = async () => (await card.getByText(/\d[\d,]*\s*cal/).first().innerText().catch(() => '?')).trim()

    const options = await sel.locator('option').evaluateAll(
      (os: HTMLOptionElement[]) => os.map((o) => ({ value: o.value, label: (o.textContent || '').trim() }))
    )
    const rows: any[] = []
    for (const opt of options) {
      // selectOption fires change; quantity resets to 1 for unit picks.
      await sel.selectOption(opt.value).catch(() => {})
      await page.waitForTimeout(350)
      rows.push({ label: opt.label, cal: await calOf() })
    }
    // back to original
    await sel.selectOption('__current__').catch(() => {})
    report.push({ name, options: rows })
  }

  console.log('AUDIT_REPORT_START')
  console.log(JSON.stringify(report, null, 2))
  console.log('AUDIT_REPORT_END')
})
