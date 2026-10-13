/**
 * Day 14, lived through the UI on the local instance, plus repeated Mind
 * sessions using the admin daily reset so several days' worth of sessions can
 * be sampled back to back.
 */
import { chromium } from '@playwright/test'
import jwt from 'jsonwebtoken'
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
const UID = '6a73f4b9b1d73f4a3f8d5a70'
const TOKEN = jwt.sign({ userId: UID, email: 'nadine@redbtn.io', role: 'admin' }, env.JWT_SECRET, { expiresIn: '6h' })
const BASE = 'http://localhost:3120'
const SHOTS = 'tests/e2e/screenshots/nadine'
fs.mkdirSync(SHOTS, { recursive: true })

const notes = []
const note = (t, m) => { notes.push(`[${t}] ${m}`); console.log(`[${t}] ${m}`) }

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addCookies([{ name: 'auth_token', value: TOKEN, domain: 'localhost', path: '/', secure: false, sameSite: 'Lax' }])
const page = await ctx.newPage()
page.on('pageerror', (e) => note('JS-ERROR', String(e).slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 500) note('HTTP-5xx', `${r.status()} ${r.url().replace(BASE, '')}`) })
await page.addInitScript((t) => {
  localStorage.setItem('token', t)
  // Skip the onboarding tour — she is 14 days in, not new.
  localStorage.setItem('become:tutorial-progress', JSON.stringify({ enabled: true, tutorials: { 'become-onboarding': { status: 'dismissed', version: 4 } } }))
}, TOKEN)

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true })
const txt = () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim())
async function tap(label, wait = 900) {
  const ok = await page.evaluate((l) => {
    const el = [...document.querySelectorAll('button,a')]
      .find((x) => (x.textContent || '').trim().toLowerCase().startsWith(l.toLowerCase()) && !x.disabled && x.offsetParent !== null)
    if (!el) return false
    el.click(); return true
  }, label)
  await page.waitForTimeout(wait)
  return ok
}


/** The Mind section opens with a 3-step intake before the hub is reachable. */
async function completeMindIntake() {
  for (let i = 0; i < 10; i++) {
    const t = await txt()
    if (!/STEP \d OF 3|Be honest with yourself/i.test(t)) return i > 0
    const picked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null)
      // Nadine: knows what she wants, execution keeps breaking down.
      // Nadine's real obstacle: she starts strong and falls off.
      const pref = btns.find((b) => /Can't stay consistent|start strong and fall off/i.test(b.textContent || ''))
        || btns.find((b) => /stuck|execution keeps breaking/i.test(b.textContent || ''))
      const target = pref || btns.find((b) => (b.textContent || '').trim().length > 12 && !/^continue/i.test((b.textContent||'').trim()))
      if (target) { target.click(); return (target.textContent || '').trim().slice(0, 60) }
      return null
    })
    if (picked) note('MIND-INTAKE', `picked "${picked}"`)
    // Step 2 and 3 want writing before Continue enables.
    const wrote = await page.evaluate(() => {
      const ta = [...document.querySelectorAll('textarea')].find((t) => t.offsetParent !== null && !t.value)
      if (!ta) return null
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      set.call(ta, 'I am a woman who trains three days a week and keeps her word to herself. I am strong, I have energy for my work and my life, and I do not quit on myself anymore.')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return 'wrote vision'
    })
    if (wrote) note('MIND-INTAKE', wrote)
    await page.waitForTimeout(700)
    if (!(await tap('Continue', 1800))) await tap('Build my system', 2600)
  }
  return true
}

async function resetDaily() {
  const r = await page.evaluate(async (t) => {
    const res = await fetch('/api/admin/mind-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ resetDailySession: true, tz: new Date().getTimezoneOffset() }),
    })
    return { status: res.status, body: (await res.text()).slice(0, 220) }
  }, TOKEN)
  note('ADMIN-RESET', `HTTP ${r.status} ${r.body}`)
  return r.status === 200
}

// ── Progress surfaces after 13 days of history ──────────────────────────────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
note('DASHBOARD d14', (await txt()).slice(0, 1000))
await shot('20-d14-dashboard')

await page.goto(`${BASE}/dashboard/progress`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
note('PROGRESS d14', (await txt()).slice(0, 900))
await shot('21-d14-progress')

await page.goto(`${BASE}/dashboard/mind`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
note('MIND HUB d14', (await txt()).slice(0, 1000))
await shot('22-d14-mindhub')

// ── Run several Mind sessions back to back, resetting between ───────────────
const FEELINGS = ['Tired', 'Scattered', 'Overwhelmed', 'Motivated', 'Drained']
for (let run = 0; run < 5; run++) {
  if (run > 0 && !(await resetDaily())) { note('LOOP', `reset failed at run ${run}`); break }
  await page.goto(`${BASE}/dashboard/mind`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  await completeMindIntake()
  await page.waitForTimeout(1500)
  if (run === 0) { note('MIND HUB post-intake', (await txt()).slice(0, 700)) }
  // The whole "Session N of 50" card is the launch control.
  const started = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')]
      .find((b) => /Session \d+ of \d+/i.test(b.textContent || '') && !b.disabled && b.offsetParent !== null)
    if (!el) return false
    el.click(); return true
  })
  await page.waitForTimeout(5000)
  if (!started) { note('SESSION', `run ${run}: no start control — ${(await txt()).slice(0, 200)}`); break }
  await page.waitForTimeout(5000)

  const beats = []
  for (let i = 0; i < 24; i++) {
    const t = await txt()
    if (/Where are you right now/i.test(t)) {
      await tap(FEELINGS[run % FEELINGS.length], 2500)
      beats.push(`state:${FEELINGS[run % FEELINGS.length]}`)
      continue
    }
    const acted = await page.evaluate(() => {
      const ta = document.querySelector('textarea')
      if (ta && ta.offsetParent !== null && !ta.value) {
        const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        s.call(ta, 'Three days a week. I keep quitting on myself and I am done with that.')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        return 'typed'
      }
      const btns = [...document.querySelectorAll('button')].filter((x) => !x.disabled && x.offsetParent !== null)
      const go = btns.find((x) => /^(continue|next|finish|done|got it|let's go|i'm ready|begin|start)/i.test((x.textContent || '').trim().toLowerCase()))
      if (go) { go.click(); return (go.textContent || '').trim().slice(0, 24) }
      const any = btns.find((x) => (x.textContent || '').trim().length > 2 && !/^(skip|exit|close|back|×)/i.test((x.textContent || '').trim().toLowerCase()))
      if (any) { any.click(); return (any.textContent || '').trim().slice(0, 24) }
      return null
    })
    if (!acted) break
    const head = (await txt()).split('\n').filter(Boolean).slice(0, 2).join(' | ').slice(0, 110)
    beats.push(`${acted} → ${head}`)
    await page.waitForTimeout(2400)
    if (/that counts|session complete|nice work|see you tomorrow/i.test(await txt())) break
  }
  note(`SESSION ${run + 1}`, `${beats.length} beats`)
  beats.forEach((x, i) => note(`  s${run + 1}b${i}`, x))
  await shot(`23-session-${run + 1}`)
}

// ── Where did she end up? ───────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard/mind`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
note('MIND HUB after runs', (await txt()).slice(0, 900))
await shot('24-mindhub-after')

const finalState = await page.evaluate(async (t) => {
  const h = { Authorization: `Bearer ${t}` }
  const out = {}
  for (const [k, u] of [['mind', '/api/mind/progress'], ['streak', '/api/streak?tz=300'], ['progress', '/api/progress?tz=300']]) {
    try { const r = await fetch(u, { headers: h }); out[k] = r.ok ? await r.json() : `HTTP ${r.status}` } catch (e) { out[k] = String(e) }
  }
  return out
}, TOKEN)
console.log('\n--- FINAL STATE ---')
console.log(JSON.stringify(finalState, null, 1).slice(0, 2200))

fs.writeFileSync(`${SHOTS}/day14-notes.txt`, notes.join('\n'))
await b.close()
