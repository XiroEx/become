import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

// Repro: changing the Serving Size dropdown on an AI estimate row should
// recompute the row's macros. Bug report says nothing changes.
test('serving size change recomputes macros', async ({ page, context }) => {
  test.setTimeout(180_000)
  await authenticate(page, context)

  await page.goto(`${BASE_URL}/dashboard/nutrition`)
  await page.waitForLoadState('domcontentloaded')

  // Open the food search (which doubles as describe). It's a button, not an input.
  await page.locator('button:has-text("Search foods")').first().click()

  // Fill the describe textarea inside the search modal.
  const textarea = page.locator('textarea[placeholder*="describe"], textarea[placeholder*="Search or describe"]').first()
  await textarea.waitFor({ state: 'visible', timeout: 15000 })
  await textarea.fill('two large eggs, a scoop of amylu chicken sausage bites, and a banana')

  // Click the describe-send button → opens the "Describe your meal" screen.
  await page.locator('button[aria-label="Describe this meal to estimate macros"]').click()

  // Click Estimate to run the AI text estimate.
  const estimateBtn = page.locator('button:has-text("Estimate")').first()
  await estimateBtn.waitFor({ state: 'visible', timeout: 15000 })
  await estimateBtn.click()

  // Wait for the review — the "Serving Size" labels appear per row.
  await expect(page.getByText('Serving Size').first()).toBeVisible({ timeout: 120_000 })
  await page.waitForTimeout(1500)

  // Requirement: EVERY item row has a serving-size dropdown (not a type field).
  const itemCount = await page.locator('button[aria-label="Remove item"]').count()
  const selects = page.locator('select[aria-label="Serving size"]')
  const n = await selects.count()
  console.log('REPRO: item rows =', itemCount, ' serving selects =', n)
  expect(n, 'every item should have a serving dropdown').toBe(itemCount)
  let target = -1
  for (let i = 0; i < n; i++) {
    const opts = await selects.nth(i).locator('option').count()
    if (opts >= 2) { target = i; break }
  }
  console.log('REPRO: first multi-option select index =', target)
  expect(target).toBeGreaterThanOrEqual(0)

  const sel = selects.nth(target)
  // The macro line for that row — climb to the item card and read its cal text.
  const row = sel.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
  const calBefore = (await row.getByText(/\d+\s*cal/).first().innerText()).trim()

  // Read the option set.
  const optionValues = await sel.locator('option').evaluateAll(
    (os: HTMLOptionElement[]) => os.map((o) => ({ value: o.value, label: o.textContent || '' }))
  )
  console.log('REPRO: options =', JSON.stringify(optionValues))

  // Requirement: a richer unit set (more than just g/oz/lb).
  expect(optionValues.length, 'dropdown should offer a rich unit set').toBeGreaterThanOrEqual(6)

  // The persistent "current" friendly serving option.
  const currentOpt = optionValues.find((o) => o.value === '__current__')
  expect(currentOpt, 'a persistent current/friendly option should exist').toBeTruthy()
  const friendlyLabel = currentOpt!.label

  // Pick a different unit option (not the current one).
  const next = optionValues.find((o) => o.value && o.value !== '__current__')
  expect(next).toBeTruthy()
  await sel.selectOption(next!.value)
  await page.waitForTimeout(1200)

  // Bug fix #1: the friendly serving must STILL be in the dropdown.
  const optionsAfter = await sel.locator('option').evaluateAll(
    (os: HTMLOptionElement[]) => os.map((o) => o.textContent || '')
  )
  console.log('REPRO: friendly="' + friendlyLabel + '" options after =', JSON.stringify(optionsAfter))
  expect(optionsAfter, 'friendly serving should remain in the dropdown after a unit change').toContain(friendlyLabel)

  // Bug fix #2: macros recompute on serving change.
  const calAfter = (await row.getByText(/\d+\s*cal/).first().innerText()).trim()
  console.log(`REPRO: cal before="${calBefore}" after="${calAfter}"`)
  await page.screenshot({ path: 'tests/e2e/screenshots/serving-bug.png', fullPage: true }).catch(() => {})
  expect(calAfter, 'macros should change when serving size changes').not.toEqual(calBefore)
})
