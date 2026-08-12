import { test, expect } from '@playwright/test'
import { BASE_URL, signToken } from './test-auth'
import fs from 'fs'

/**
 * Walk the whole daily Mind session and capture every scene, so the session a
 * member actually experiences can be reviewed as a sequence instead of guessed
 * at from one screenshot.
 *
 * Runs against a scratch CLONE of a real account (become_mind_audit), never the
 * live one — the main session has a 20h cooldown and burning it would cost the
 * member their day.
 *
 * Two traps, both of which look like the session is broken when it is the
 * harness that is:
 *   - the session renders OVER the Mind hub, and the hub has its own mood tiles,
 *     so an unscoped locator grabs a hidden button underneath and clicks nothing
 *   - the Next dev-tools portal sits over the bottom-left and eats clicks
 * Everything below is scoped to :visible for the first, and the portal is
 * hidden for the second.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3210 npx playwright test --project=mind-audit
 */

const USER = { id: '69324119a28a8ac3b78750b9', email: 'jondon27500@gmail.com' }
const SHOTS = 'tests/e2e/screenshots/mind-audit'
const FEELING = 'Grateful' // the member's real check-in that day

test('walk every scene of the daily session', async ({ page, context }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const token = signToken(USER.id, USER.email, 'user')
  const url = new URL(BASE_URL)
  await context.addCookies([
    { name: 'auth_token', value: token, domain: url.hostname, path: '/', httpOnly: false,
      secure: url.protocol === 'https:', sameSite: 'Lax' },
  ])
  await page.addInitScript(t => localStorage.setItem('token', t as string), token)
  await page.addInitScript(() => {
    const s = document.createElement('style')
    s.textContent = 'nextjs-portal,[data-nextjs-toast]{display:none!important}'
    document.documentElement.appendChild(s)
  })

  const notes: string[] = []
  page.on('console', m => {
    if (m.type() === 'error') notes.push(`CONSOLE ERROR: ${m.text().slice(0, 160)}`)
  })

  await page.goto(`${BASE_URL}/dashboard/mind`)
  await page.waitForLoadState('domcontentloaded')
  for (let i = 0; i < 10; i++) {
    if (await page.locator('.rtut-shield').count() === 0) break
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/00-hub.png` })

  const startBtn = page.locator('button:visible', { hasText: /Begin|Start/ }).first()
  await startBtn.click()
  await page.waitForTimeout(1000)
  const begin = page.locator('button:visible', { hasText: /^Begin$/ }).first()
  if (await begin.isVisible().catch(() => false)) { await begin.click(); await page.waitForTimeout(1200) }

  /** Everything the member can currently see. */
  const visibleText = async () => {
    const parts = await page.locator('h1:visible, h2:visible, p:visible, span:visible, label:visible')
      .allInnerTexts().catch(() => [] as string[])
    return [...new Set(parts.map(t => t.trim()).filter(Boolean))]
  }

  for (let step = 0; step < 16; step++) {
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${SHOTS}/${String(step + 1).padStart(2, '0')}-step.png` })

    const lines = await visibleText()
    const screen = lines.join(' | ')
    notes.push(`\n--- step ${step} ---\n${lines.slice(0, 14).join('\n')}`)

    // A step that wants typing must actually ASK something.
    const hasInput = await page.locator('textarea:visible, input[type="text"]:visible').count() > 0
    if (hasInput && !/\?/.test(screen)) {
      notes.push(`  >>> FINDING: asks for input but no question is on screen`)
    }
    // A statement rendered as the whole screen with no framing reads as a prompt.
    if (/^Lock in/.test(lines[1] ?? '') && !/\?/.test(screen)) {
      notes.push(`  >>> FINDING: "Lock in" with no question`)
    }

    // ── advance ────────────────────────────────────────────────────────────
    const tile = page.locator('button:visible', { hasText: new RegExp(`^${FEELING}$`) }).first()
    if (await tile.isVisible().catch(() => false)) {
      await tile.click()
      notes.push(`  (tapped ${FEELING})`)
      await page.waitForTimeout(1200)
      continue
    }

    const ta = page.locator('textarea:visible').first()
    if (await ta.isVisible().catch(() => false)) {
      await ta.fill('Finish the section I keep pushing')
      await page.waitForTimeout(250)
    }

    const hold = page.locator(':visible', { hasText: /^Hold to affirm$/ }).first()
    if (await hold.isVisible().catch(() => false)) {
      const box = await hold.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(2800)
        await page.mouse.up()
      }
      await page.waitForTimeout(1400)
      continue
    }

    const cta = page.locator('button:visible', {
      hasText: /^(Continue|Lock it in|Next|Done|I did it|Save|Bank it|Got it|Yes|Start)/,
    }).first()
    if (await cta.isVisible().catch(() => false)) {
      await cta.click()
      await page.waitForTimeout(700)
      continue
    }

    const skip = page.locator('button:visible, [role="button"]:visible', { hasText: /^Skip$/ }).first()
    if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(700); continue }

    // Some scenes are confirmations that advance themselves after a beat.
    // Wait before calling anything a dead end, or the harness reports its own
    // impatience as a product bug.
    let moved = false
    const before = screen
    for (let w = 0; w < 4; w++) {
      await page.waitForTimeout(1500)
      if ((await visibleText()).join(' | ') !== before) { moved = true; break }
    }
    if (moved) continue

    notes.push(`  >>> FINDING: nothing actionable and nothing auto-advanced after 6s — dead end`)
    break
  }

  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/99-close.png` })
  notes.push('\n--- CLOSE ---\n' + (await visibleText()).join('\n').slice(0, 2000))

  fs.writeFileSync(`${SHOTS}/notes.txt`, notes.join('\n'))
  console.log(notes.join('\n'))

  // The real invariant, and the one that actually broke: a scene that asks the
  // member to type must have a question on it. "Lock in" shipped with only a
  // title and their own saved sentence, so the only way to answer was to guess
  // what was being asked.
  //
  // Dead-end notes are informational — this harness cannot perform every
  // interaction (the speak scene wants a tap per word), so it must not fail the
  // run for its own gaps.
  const silentPrompts = notes.filter(n => n.includes('no question is on screen'))
  expect(silentPrompts, `scene(s) asked for input with no question:\n${silentPrompts.join('\n')}`).toEqual([])
})
