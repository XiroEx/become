import { test } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

test.use({ viewport: { width: 390, height: 844 } })
test.setTimeout(180_000)

const shots: Array<[string, string]> = [
  ['/dashboard', 'home'],
  ['/dashboard/workout', 'workout-hub'],
  ['/dashboard/mind', 'mind-home'],
  ['/dashboard/community', 'community'],
  ['/dashboard/progress', 'progress'],
  ['/dashboard/calendar', 'calendar'],
  ['/dashboard/settings', 'settings'],
]

test('app UI screenshots', async ({ page, context }) => {
  await authenticate(page, context)
  for (const [path, name] of shots) {
    await page.goto(`${BASE_URL}${path}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `/tmp/app-shots/${name}.png`, fullPage: false })
  }
})
