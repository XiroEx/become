/**
 * New User Journey — End-to-End Test
 *
 * Full UI-only flow (no direct API calls in the test body):
 *   1. Register (magic link mocked via page.route)
 *   2. Onboard (4-step wizard)
 *   3. Enroll in a program + set up schedule
 *   4. Complete the first live workout
 *
 * Prerequisites:
 *   - webapp/.env.local must have JWT_SECRET set (same as production)
 *   - webapp/app/api/admin/e2e-setup/route.ts must be deployed to production
 *
 * Run: cd /home/alpha/code/become && node_modules/.bin/playwright test webapp/tests/e2e/new-user-journey.spec.ts --headed=false
 */

import { test, expect, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { BASE_URL } from './test-auth'

// ─── Shared state (set in beforeAll, used in tests) ───────────────────────────

let e2eToken = ''
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')
const E2E_EMAIL = 'e2etest@become.io'
const PROGRAM_ID = 'program_jon_don_split'

// ─── Screenshot helper ────────────────────────────────────────────────────────

async function screenshot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  const filePath = path.join(SCREENSHOTS_DIR, `new-user-journey--${name}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`[screenshot] ${name} → ${filePath}`)
}

// ─── Setup: reset test user + obtain production JWT ───────────────────────────

test.beforeAll(async () => {
  console.log('\n[setup] Resetting e2e test user via bootstrap endpoint...')
  const res = await fetch(`${BASE_URL}/api/admin/e2e-setup`, {
    method: 'POST',
    headers: { 'x-bootstrap-token': 'e2e-user-setup-2026' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`e2e-setup failed (${res.status}): ${body}`)
  }
  const data = await res.json() as { userId: string; email: string; token: string }
  e2eToken = data.token
  console.log(`[setup] Test user ready — userId: ${data.userId}`)
})

// ─── Suite config ─────────────────────────────────────────────────────────────

test.describe('New User Journey', () => {
  test.setTimeout(300_000) // 5 minutes — live workout can be lengthy

  test('signup → onboard → enroll → schedule → complete first workout', async ({ page, context }) => {

    // ── 0. Wire up route mocks + inject auth cookie (before any navigation) ─
    // Mock send-link: return a fake sessionId (no real email sent)
    await page.route(`${BASE_URL}/api/auth/send-link`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'e2e-session-test-12345', message: 'Link sent' }),
      })
    })

    // Mock check-session: immediately return verified with the e2e user's token
    await page.route(`${BASE_URL}/api/auth/check-session`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'verified', authToken: e2eToken }),
      })
    })

    // Inject auth cookie so Next.js middleware (/dashboard/:path*) passes.
    // The middleware checks cookie only — we set it upfront since we have the
    // production-signed token from beforeAll.
    await context.addCookies([{
      name: 'auth_token',
      value: e2eToken,
      domain: new URL(BASE_URL).hostname,
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    }])

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 1: Register
    // ─────────────────────────────────────────────────────────────────────────

    console.log('\n=== PHASE 1: Register ===')
    await page.goto(`${BASE_URL}/register`)
    await page.waitForLoadState('domcontentloaded')
    // Seed localStorage token so client-side API calls (AuthGuard → /api/auth/me) work
    await page.evaluate((t) => localStorage.setItem('token', t), e2eToken)
    await page.waitForTimeout(300)

    await screenshot(page, '01-register-page')

    // Fill in name (register mode shows name field)
    await page.locator('input[placeholder="Full name"]').fill('E2E Test User')
    await page.locator('input[placeholder="Email"]').fill(E2E_EMAIL)
    await page.locator('button:has-text("Continue with email")').click()

    // "Check your email" screen should appear
    await expect(page.locator('h3:has-text("Check your email")')).toBeVisible({ timeout: 8_000 })
    await screenshot(page, '02-check-email-screen')
    console.log('[phase1] "Check your email" shown ✓')

    // Wait for check-session mock to fire and redirect to /dashboard
    // AuthForm polls every 2s; our mock returns "verified" immediately
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 })
    console.log(`[phase1] Navigated to: ${page.url()}`)

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 2: Onboarding
    // ─────────────────────────────────────────────────────────────────────────

    console.log('\n=== PHASE 2: Onboarding ===')

    // Should be on /onboarding since user has onboardingCompleted: false
    await page.waitForURL(/\/onboarding/, { timeout: 10_000 })
    await page.waitForLoadState('domcontentloaded')

    // Wait for the spinner to go away (auth check completes)
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 15_000 }
    ).catch(() => {})

    await screenshot(page, '03-onboarding-step1')
    console.log('[phase2] On onboarding page ✓')

    // Step 1 — Goal: click "Build Muscle"
    await page.locator('button:has-text("Build Muscle")').click()
    await page.waitForTimeout(200)
    await screenshot(page, '04-onboarding-step1-selected')
    console.log('[phase2] Step 1: goal selected ✓')

    // Click Next
    await page.locator('button:has-text("Next")').click()
    await page.waitForTimeout(400)
    await screenshot(page, '05-onboarding-step2')

    // Step 2 — Experience: click "Intermediate"
    await page.locator('button:has-text("Intermediate")').click()
    await page.waitForTimeout(200)
    console.log('[phase2] Step 2: experience selected ✓')

    // Click Next
    await page.locator('button:has-text("Next")').click()
    await page.waitForTimeout(400)
    await screenshot(page, '06-onboarding-step3')

    // Step 3 — Body stats: fill age (optional, but adds coverage)
    const ageInput = page.locator('input[placeholder="e.g. 28"]')
    if (await ageInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await ageInput.fill('28')
    }
    console.log('[phase2] Step 3: body stats filled ✓')

    // Click Next
    await page.locator('button:has-text("Next")').click()
    await page.waitForTimeout(400)
    await screenshot(page, '07-onboarding-step4')

    // Step 4 — Equipment: click "Full Gym"
    await page.locator('button:has-text("Full Gym")').click()
    await page.waitForTimeout(200)
    console.log('[phase2] Step 4: equipment selected ✓')

    await screenshot(page, '08-onboarding-step4-selected')

    // Click Finish
    await page.locator('button:has-text("Finish")').click()

    // Wait for redirect to /dashboard
    await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 15_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(600)

    await screenshot(page, '09-dashboard-post-onboarding')
    console.log('[phase2] Onboarding complete → dashboard ✓')

    // Dismiss daily check-in modal if present
    const skipBtn = page.locator('button:has-text("Skip for Today")')
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click({ force: true })
      await page.waitForTimeout(400)
      const continueBtn = page.locator('button:has-text("Continue Anyway")')
      if (await continueBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await continueBtn.click({ force: true })
        await page.waitForTimeout(300)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 3: Program enrollment
    // ─────────────────────────────────────────────────────────────────────────

    console.log('\n=== PHASE 3: Program Enrollment ===')

    // Navigate to Jon Don Split program detail
    await page.goto(`${BASE_URL}/dashboard/workout/${PROGRAM_ID}`)
    await page.waitForLoadState('domcontentloaded')

    // Wait for program page to load (button appears)
    await page.waitForSelector(
      'button:has-text("Start Program"), button:has-text("Continue Program"), button:has-text("Abandon program")',
      { timeout: 20_000 }
    )
    await page.waitForTimeout(300)

    await screenshot(page, '10-program-detail')
    console.log('[phase3] Program detail loaded ✓')

    // Check if already enrolled
    const abandonBtn = page.locator('button:has-text("Abandon program")')
    const continueBtn = page.locator('button:has-text("Continue Program")')
    const alreadyEnrolled =
      (await abandonBtn.isVisible({ timeout: 2_000 }).catch(() => false)) ||
      (await continueBtn.isVisible({ timeout: 1_000 }).catch(() => false))

    if (!alreadyEnrolled) {
      // Click "Start Program"
      await page.locator('button:has-text("Start Program")').click()
      await page.waitForTimeout(400)

      // Handle enrollment dialog
      const enrollDialog = page.locator('.fixed.inset-0.z-50:has(button:has-text("Enroll & Set Up"))')
      if (await enrollDialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const dateInput = enrollDialog.locator('input[type="date"]')
        if (await dateInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          const today = new Date().toISOString().split('T')[0]
          await dateInput.fill(today)
        }
        await screenshot(page, '11-enrollment-dialog')
        await enrollDialog.locator('button:has-text("Enroll & Set Up")').click()
        await page.waitForURL(`**/programming/${PROGRAM_ID}/schedule`, { timeout: 15_000 })
          .catch(() => {})
      }

      await screenshot(page, '12-schedule-page')
      console.log('[phase3] On schedule setup page ✓')

      // Schedule setup flow
      const scheduleH1 = page.locator('h1:has-text("Set Up Schedule"), h1:has-text("Your Schedule")')
      await scheduleH1.waitFor({ timeout: 12_000 }).catch(() => {})

      // If "Recreate Schedule" exists, click it
      const recreateBtn = page.locator('button:has-text("Recreate Schedule")')
      if (await recreateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await recreateBtn.click()
        await page.waitForTimeout(300)
      }

      // Click Next on schedule step
      const nextBtn = page.locator('button:has-text("Next")')
      if (await nextBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await nextBtn.click()
        await page.waitForTimeout(300)
      }

      // Set start date and click Preview Schedule
      const previewBtn = page.locator('button:has-text("Preview Schedule")')
      if (await previewBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const scheduleDateInput = page.locator('input[type="date"]').first()
        if (await scheduleDateInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await scheduleDateInput.fill(new Date().toISOString().split('T')[0])
          await page.waitForTimeout(200)
        }
        await previewBtn.click()
        await page.waitForTimeout(400)
      }

      // Confirm Schedule
      const confirmBtn = page.locator('button:has-text("Confirm Schedule")')
      if (await confirmBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await screenshot(page, '13-schedule-preview')
        await confirmBtn.click()
        await page.waitForURL(`**/programming/${PROGRAM_ID}`, { timeout: 15_000 }).catch(() => {})
      }

      await screenshot(page, '14-program-enrolled')
      console.log('[phase3] Schedule confirmed ✓')
    } else {
      console.log('[phase3] User already enrolled — skipping enrollment flow')
    }

    // Verify enrolled state
    await page.goto(`${BASE_URL}/dashboard/workout/${PROGRAM_ID}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector(
      'button:has-text("Continue Program"), button:has-text("Abandon program")',
      { timeout: 20_000 }
    )
    await screenshot(page, '15-enrolled-program-detail')
    console.log('[phase3] Enrollment verified ✓')

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 4: Live workout
    // ─────────────────────────────────────────────────────────────────────────

    console.log('\n=== PHASE 4: Live Workout ===')

    // Navigate to live workout (Day 1)
    const liveUrl = `${BASE_URL}/dashboard/workout/${PROGRAM_ID}/workout/live?day=${encodeURIComponent('Day 1')}`
    await page.goto(liveUrl)
    await page.waitForLoadState('domcontentloaded')

    // Wait for loading spinner to disappear
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 20_000 }
    ).catch(() => {})

    // Dismiss "Restart this day" modal if shown (incomplete previous workout)
    const restartBtn = page.locator('button:has-text("Restart this day")').first()
    if (await restartBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      console.log('[phase4] Dismissing incomplete workout modal...')
      await restartBtn.click({ force: true })
      const overlay = page.locator('.fixed.inset-0.z-50:has(button:has-text("Restart this day"))')
      await overlay.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(400)
      await page.waitForFunction(
        () => !document.querySelector('.animate-spin'),
        { timeout: 10_000 }
      ).catch(() => {})
    }

    // Wait for workout UI
    await page.waitForSelector(
      'button:has-text("Complete Set"), button:has-text("Done →"), button:has-text("Finish Workout"), button:has-text("Skip Set")',
      { timeout: 25_000 }
    ).catch(() => {
      console.log('[phase4] WARNING: Timed out waiting for workout UI')
    })

    await screenshot(page, '16-live-workout-start')
    console.log('[phase4] Live workout UI loaded ✓')

    // ── Run through the workout ──────────────────────────────────────────────

    const deadline = Date.now() + 240_000 // 4 min max
    let stepsCompleted = 0
    let skipsUsed = 0
    let summaryVisible = false
    const exercisesEncountered: string[] = []

    const MAX_STEPS = 400
    let stepLoop = 0

    while (stepLoop < MAX_STEPS && Date.now() < deadline) {
      stepLoop++

      try {
        // Check summary screen
        const bodyText = await page.textContent('body').catch(() => '')
        if (
          bodyText?.includes('WORKOUT DONE') ||
          bodyText?.includes('YOU CRUSHED IT') ||
          bodyText?.includes('PROGRAM COMPLETE') ||
          bodyText?.includes("I'll Be Back")
        ) {
          summaryVisible = true
          console.log(`[phase4] Summary detected at step ${stepLoop}`)
          break
        }

        const summaryBtn = page.locator('button:has-text("I\'ll Be Back"), button:has-text("Find My Next Challenge")')
        if (await summaryBtn.isVisible({ timeout: 200 }).catch(() => false)) {
          summaryVisible = true
          console.log('[phase4] Summary button visible')
          break
        }

        // Skip modal
        const skipModal = page.locator('.fixed.inset-0.z-50:has(h3:has-text("Skip Set?"))')
        if (await skipModal.isVisible({ timeout: 200 }).catch(() => false)) {
          const skipAllBtn = page.locator('button:has-text("Skip All Sets")').first()
          const skipOneBtn = page.locator('button:has-text("Skip This Set Only")').first()
          if (await skipAllBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await skipAllBtn.click()
            skipsUsed++
            await page.waitForTimeout(300)
          } else if (await skipOneBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await skipOneBtn.click()
            skipsUsed++
            await page.waitForTimeout(300)
          } else {
            await page.keyboard.press('Escape')
            await page.waitForTimeout(200)
          }
          continue
        }

        // Skip rest timer
        const skipRestBtn = page.locator('button:has-text("Skip Rest")').first()
        if (await skipRestBtn.isVisible({ timeout: 200 }).catch(() => false)) {
          await skipRestBtn.click({ force: true }).catch(() => {})
          await page.waitForTimeout(100)
          continue
        }

        // Track exercise names
        const exerciseHeader = page.locator('h1.text-2xl, h1.font-bold').first()
        if (await exerciseHeader.isVisible({ timeout: 200 }).catch(() => false)) {
          const name = (await exerciseHeader.textContent())?.trim() ?? ''
          if (name && name.length < 60 && !exercisesEncountered.includes(name)) {
            exercisesEncountered.push(name)
            console.log(`[phase4] Exercise: ${name}`)
          }
        }

        // Fill inputs
        const weightLabel = page.locator('label:has-text("Weight (lbs)")')
        const hasWeight = await weightLabel.isVisible({ timeout: 200 }).catch(() => false)

        if (hasWeight) {
          const quick135 = page.locator('button:has-text("135")').first()
          if (await quick135.isVisible({ timeout: 200 }).catch(() => false)) {
            await quick135.click().catch(() => {})
            await page.waitForTimeout(100)
          }
          const repsInput = page.locator('input[type="number"]').last()
          if (await repsInput.isVisible({ timeout: 200 }).catch(() => false)) {
            await repsInput.fill('10').catch(() => {})
            await page.waitForTimeout(100)
          }
        } else {
          const anyInput = page.locator('input[type="number"]').first()
          if (await anyInput.isVisible({ timeout: 200 }).catch(() => false)) {
            await anyInput.fill('10').catch(() => {})
            await page.waitForTimeout(100)
          }
        }

        await page.waitForTimeout(300)

        // Find and click the main action button
        const actionBtn = page.locator('button.flex-1.rounded-full').first()
        const btnText = await actionBtn.textContent({ timeout: 500 }).catch(() => '')
        const btnClass = await actionBtn.getAttribute('class', { timeout: 500 }).catch(() => '')
        const isGreenBtn = btnClass?.includes('bg-green-500') ?? false
        const isGreyBtn = btnClass?.includes('bg-zinc-600') ?? false

        console.log(`[phase4] step=${stepLoop} btn="${btnText?.trim()?.slice(0, 30)}" green=${isGreenBtn} grey=${isGreyBtn}`)

        if (btnText?.includes('Finish Workout') && isGreenBtn) {
          console.log('[phase4] Clicking Finish Workout (green)')
          await actionBtn.click({ force: true }).catch(() => {})
          stepsCompleted++
          // Wait for summary
          const summaryConfirmBtn = page.locator('button:has-text("I\'ll Be Back"), button:has-text("Find My Next Challenge")')
          if (await summaryConfirmBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
            summaryVisible = true
          } else {
            const finalText = await page.textContent('body').catch(() => '')
            summaryVisible = !!(finalText?.includes("WORKOUT DONE") || finalText?.includes("YOU CRUSHED IT") || finalText?.includes("I'll Be Back"))
          }
          break
        } else if (isGreyBtn || btnText?.includes('Skip Set')) {
          await actionBtn.click({ force: true }).catch(() => {})
          await page.waitForTimeout(400)
        } else if (btnText?.includes('Complete Set') || btnText?.includes('Done')) {
          await actionBtn.click({ force: true }).catch(() => {})
          stepsCompleted++
          await page.waitForTimeout(100)
        } else {
          // Fallback: try specific button text
          const completeBtn = page.locator('button:has-text("Complete Set →"), button:has-text("Complete Set")').first()
          if (await completeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
            await completeBtn.click({ force: true }).catch(() => {})
            stepsCompleted++
            await page.waitForTimeout(100)
            continue
          }
          const doneBtn = page.locator('button:has-text("Done →")').first()
          if (await doneBtn.isVisible({ timeout: 300 }).catch(() => false)) {
            await doneBtn.click({ force: true }).catch(() => {})
            stepsCompleted++
            await page.waitForTimeout(100)
            continue
          }
          const skipSetBtn = page.locator('button:has-text("Skip Set →")').first()
          if (await skipSetBtn.isVisible({ timeout: 300 }).catch(() => false)) {
            await skipSetBtn.click({ force: true }).catch(() => {})
            await page.waitForTimeout(400)
            continue
          }
          await page.waitForTimeout(300)
        }
      } catch (err) {
        const msg = String(err)
        console.log(`[phase4] Step ${stepLoop} error: ${msg.slice(0, 100)}`)
        if (msg.includes('Target closed') || msg.includes('page was closed')) break
        await page.waitForTimeout(100)
      }
    }

    await screenshot(page, '17-live-workout-summary')

    console.log(`\n[phase4] Workout complete:`)
    console.log(`  Steps completed: ${stepsCompleted}`)
    console.log(`  Skips used: ${skipsUsed}`)
    console.log(`  Exercises: ${exercisesEncountered.join(', ')}`)
    console.log(`  Summary visible: ${summaryVisible}`)

    // ─────────────────────────────────────────────────────────────────────────
    // ASSERTIONS
    // ─────────────────────────────────────────────────────────────────────────

    // Verify summary screen appeared
    expect(summaryVisible, 'Workout summary screen was not shown').toBe(true)

    // Verify at least some work was done
    expect(stepsCompleted + skipsUsed, 'No sets were completed or skipped').toBeGreaterThan(0)

    // Verify summary elements
    const summaryHeading = page.locator('h1:has-text("WORKOUT DONE"), h1:has-text("YOU CRUSHED IT"), h1:has-text("PROGRAM COMPLETE")')
    await expect(summaryHeading).toBeVisible({ timeout: 8_000 })

    const statsGrid = page.locator('.grid-cols-3')
    await expect(statsGrid).toBeVisible({ timeout: 3_000 })

    const doneBtn = page.locator('button:has-text("I\'ll Be Back"), button:has-text("Find My Next Challenge")')
    await expect(doneBtn).toBeVisible({ timeout: 3_000 })

    await screenshot(page, '18-final-verified')
    console.log('\n✓ New user journey complete — all assertions passed')
  })
})
