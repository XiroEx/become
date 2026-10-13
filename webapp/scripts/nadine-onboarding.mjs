/**
 * Persona run: Nadine, 36F, out of shape, busy, cardio-leaning, wants change.
 * Walks the real 5-step onboarding on become.redbtn.io, one step at a time,
 * recording what each screen asked and what she answered.
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
const screenText = () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim())

/** Click a button by its exact visible label. */
async function tap(label) {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => (x.textContent || '').trim().toLowerCase().startsWith(l.toLowerCase()) && !x.disabled)
    if (!b) return false
    b.click(); return true
  }, label)
  note(ok ? 'TAP' : 'MISS', label)
  await page.waitForTimeout(700)
  return ok
}

async function fill(matcher, value) {
  const ok = await page.evaluate(([m, v]) => {
    const inputs = [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null)
    const re = new RegExp(m, 'i')
    const target = inputs.find((i) => {
      const around = ((i.closest('label') || i.parentElement?.parentElement || i.parentElement)?.innerText || '') + ' ' + i.placeholder + ' ' + i.name
      return re.test(around)
    })
    if (!target) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(target, v)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, [matcher, value])
  note(ok ? 'FILL' : 'MISS-FIELD', `${matcher} = ${value}`)
  await page.waitForTimeout(400)
  return ok
}

await page.goto(`${BASE}/onboarding`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// ── Step 1 — Goals ──────────────────────────────────────────────────────────
note('STEP 1', (await screenText()).slice(0, 260))
await shot('01-goals')
await tap('Lose Weight')          // primary
await tap('General Health')       // secondary — she wants to feel better generally
await shot('01-goals-picked')
await tap('Next')

// ── Step 2 — Background ─────────────────────────────────────────────────────
await page.waitForTimeout(1200)
note('STEP 2', (await screenText()).slice(0, 400))
await shot('02-background')
await tap('Beginner')
await tap('Next')

// ── Step 3 — Body & nutrition ───────────────────────────────────────────────
await page.waitForTimeout(1500)
note('STEP 3', (await screenText()).slice(0, 900))
await shot('03-body')
await tap('Female')
const nums = page.locator('input[type=number]')
await nums.nth(0).fill('36')    // age
await nums.nth(1).fill('5')     // height ft
await nums.nth(2).fill('5')     // height in
await nums.nth(3).fill('178')   // current weight
await nums.nth(4).fill('150')   // target weight
note('FILL', 'age 36, 5ft 5in, 178lb now, 150lb target')
await page.waitForTimeout(600)
await tap('Lightly Active')     // busy desk job, some walking
await tap('Recommended')        // she does not know macros; takes the default
await shot('03-body-filled')
note('STEP 3 FILLED', (await screenText()).slice(0, 1400))
await tap('Next')

// ── Step 4 — Equipment ──────────────────────────────────────────────────────
await page.waitForTimeout(1200)
note('STEP 4', (await screenText()).slice(0, 400))
await shot('04-equipment')
await tap('Dumbbells')   // she has a couple at home + treadmill at the gym
await tap('Next')

// ── Step 5 — Review ─────────────────────────────────────────────────────────
await page.waitForTimeout(1200)
note('STEP 5 REVIEW', (await screenText()).slice(0, 1200))
await shot('05-review')
await tap('Finish') || await tap('Next')
await page.waitForTimeout(4000)
await shot('06-after-finish')
note('URL', page.url())
note('AFTER', (await screenText()).slice(0, 400))

const computed = await page.evaluate(async (t) => {
  const h = { Authorization: `Bearer ${t}` }
  const out = {}
  for (const [k, u] of [['profile', '/api/profile'], ['goals', '/api/nutrition/goals']]) {
    try { const r = await fetch(u, { headers: h }); out[k] = r.ok ? await r.json() : `HTTP ${r.status}` } catch (e) { out[k] = String(e) }
  }
  return out
}, TOKEN)
console.log('\n--- WHAT ONBOARDING COMPUTED FOR NADINE ---')
console.log(JSON.stringify(computed, null, 2).slice(0, 3000))

fs.writeFileSync(`${SHOTS}/notes.txt`, notes.join('\n'))
await b.close()
