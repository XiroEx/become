/**
 * Nadine's day on production: dashboard → daily check-in → Mind session →
 * nutrition. Observational: records what each screen said, screenshots it, and
 * flags anything that looks wrong.
 */
import { chromium } from '@playwright/test'
import fs from 'fs'

const TOKEN = fs.readFileSync('/tmp/.nadine', 'utf8').trim()
const BASE = 'https://become.redbtn.io'
const SHOTS = 'tests/e2e/screenshots/nadine'
fs.mkdirSync(SHOTS, { recursive: true })

const notes = []
const note = (t, m) => { notes.push(`[${t}] ${m}`); console.log(`[${t}] ${m}`) }

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addCookies([{ name: 'auth_token', value: TOKEN, domain: 'become.redbtn.io', path: '/', secure: true, sameSite: 'Lax' }])
const page = await ctx.newPage()
page.on('pageerror', (e) => note('JS-ERROR', String(e).slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 500) note('HTTP-5xx', `${r.status()} ${r.url().replace(BASE, '')}`) })
await page.addInitScript((t) => localStorage.setItem('token', t), TOKEN)

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true })
const txt = () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim())
async function tap(label, timeout = 700) {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button,a')]
      .find((x) => (x.textContent || '').trim().toLowerCase().startsWith(l.toLowerCase()) && !x.disabled)
    if (!b) return false
    b.click(); return true
  }, label)
  note(ok ? 'TAP' : 'MISS', label)
  await page.waitForTimeout(timeout)
  return ok
}

// ── Dashboard ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
note('DASHBOARD', (await txt()).slice(0, 900))
await shot('10-dashboard')

// Daily check-in, if it surfaced.
if (/Daily check-in/i.test(await txt())) {
  note('CHECKIN', 'modal shown on first dashboard visit')
  await tap('Pretty Good')
  const w = page.locator('input[type=number]').first()
  if (await w.count()) { await w.fill('178'); note('CHECKIN', 'weight 178 entered') }
  await shot('11-checkin')
  await tap('Save Check-in', 2500)
} else {
  note('CHECKIN', 'NOT shown on first visit')
}
await shot('12-after-checkin')

// ── Mind ─────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard/mind`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
note('MIND HUB', (await txt()).slice(0, 900))
await shot('13-mind-hub')

// Start the daily session.
for (const label of ['Start', "Today's session", 'Begin', 'Open']) {
  if (await tap(label, 5000)) break
}
await page.waitForTimeout(6000)
note('SESSION', (await txt()).slice(0, 600))
await shot('14-session-open')

// Walk the session: answer honestly as Nadine, advance until it ends.
for (let i = 0; i < 26; i++) {
  const t = await txt()
  if (/Where are you right now/i.test(t)) {
    note('SESSION', 'state check — picking "Tired" (busy week, up early)')
    await tap('Tired', 2500)
  }
  const acted = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null)
    const ta = document.querySelector('textarea')
    if (ta && ta.offsetParent !== null && !ta.value) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, "I want to stop starting over. Three days a week, no matter what.")
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return 'typed an answer'
    }
    const go = btns.find((b) => /^(continue|next|finish|done|got it|let's go|start|i'm ready|begin)/i.test((b.textContent || '').trim().toLowerCase()))
    if (go) { go.click(); return `tapped "${go.textContent.trim().slice(0, 30)}"` }
    const any = btns.find((b) => (b.textContent || '').trim().length > 2 && !/^(skip|exit|close|back)/i.test((b.textContent || '').trim().toLowerCase()))
    if (any) { any.click(); return `tapped "${any.textContent.trim().slice(0, 30)}"` }
    return null
  })
  if (!acted) { note('SESSION', `no control at beat ${i}`); break }
  note('BEAT ' + i, `${acted} :: ${(await txt()).split('\n').slice(0, 3).join(' | ').slice(0, 150)}`)
  await page.waitForTimeout(2600)
  if (/that counts|session complete|see you tomorrow|nice work/i.test(await txt())) {
    note('SESSION', 'reached completion')
    break
  }
}
await shot('15-session-end')
note('SESSION END', (await txt()).slice(0, 800))

// ── Nutrition ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard/nutrition`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
note('NUTRITION', (await txt()).slice(0, 900))
await shot('16-nutrition')

fs.writeFileSync(`${SHOTS}/day-notes.txt`, notes.join('\n'))
await b.close()
