import { test } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

test.use({ viewport: { width: 390, height: 844 } })
test.setTimeout(120_000)

const shots: Array<[string, string]> = [
  ['/dashboard/nutrition', 'nutrition-day'],
  ['/dashboard/meals', 'meals-recipes'],
  ['/dashboard/timeline?view=day', 'timeline-day'],
  ['/dashboard/timeline?view=week', 'timeline-week'],
  ['/dashboard/nutrition/goals', 'goals'],
]

test('nutrition UI screenshots', async ({ page, context }) => {
  await authenticate(page, context)
  for (const [path, name] of shots) {
    await page.goto(`${BASE_URL}${path}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `/tmp/nutri-shots/${name}.png`, fullPage: true })
  }
})
