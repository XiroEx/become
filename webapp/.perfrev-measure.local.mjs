import { chromium, devices } from '@playwright/test'
import { readFileSync } from 'fs'
const BASE = 'http://localhost:3210'
const TOKEN = readFileSync('/tmp/hb/jon.token', 'utf8').trim()
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const u = new URL(BASE)
await ctx.addCookies([{ name: 'auth_token', value: TOKEN, domain: u.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }])
await page.goto(`${BASE}/login`)
await page.evaluate(t => { localStorage.setItem('token', t); Object.keys(localStorage).filter(k => k.startsWith('becoming.intro')).forEach(k => localStorage.removeItem(k)); sessionStorage.setItem('becoming.opened', '1') }, TOKEN)
const t0 = Date.now()
await page.goto(`${BASE}/dashboard/mind/becoming`, { waitUntil: 'domcontentloaded' })
const resp = await page.waitForResponse(r => r.url().includes('/api/becoming/journey') && r.ok(), { timeout: 120_000 })
const body = await resp.body()
console.log('journey payload bytes', body.length, 'weeks', JSON.parse(body.toString()).weeks.length, 'ms', Date.now() - t0)
const stage = page.locator('[data-testid="journey-stage"]')
await stage.waitFor()
await page.waitForFunction(() => document.querySelector('[data-testid="journey-stage"]')?.getAttribute('data-mode') === 'focus', null, { timeout: 15000 })
await page.waitForTimeout(1500)
const dom = await page.evaluate(() => {
  const st = document.querySelector('[data-testid="journey-stage"]')
  const all = st.querySelectorAll('*')
  let filtered = 0, transitions = 0, blurCards = 0
  for (const el of all) { const cs = getComputedStyle(el); if (cs.filter && cs.filter !== 'none') filtered++; if (cs.transitionProperty && cs.transitionProperty !== 'all' && cs.transitionDuration !== '0s') transitions++ }
  const cards = st.querySelectorAll('[data-week-index]')
  const svgEls = st.querySelectorAll('svg *').length
  return { total: all.length, filtered, transitions, cards: cards.length, svgEls, worldWidth: null }
})
console.log('DOM', dom)
// React render counting via React DevTools hook is not available; measure frames instead.
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await page.evaluate(() => {
  window.__frames = []; window.__long = []
  let last = performance.now()
  const tick = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
})
async function measure(label, fn) {
  await page.evaluate(() => { window.__frames = []; window.__long = [] })
  await fn()
  await page.waitForTimeout(1400)
  const r = await page.evaluate(() => { const f = window.__frames; return { n: f.length, max: Math.round(Math.max(...f)), over50: f.filter(x => x > 50).length, over100: f.filter(x => x > 100).length, long: window.__long } })
  console.log(label, JSON.stringify(r))
}
await measure('prev click', () => page.locator('[data-testid="journey-prev"]').click())
await measure('prev click 2', () => page.locator('[data-testid="journey-prev"]').click())
await measure('next click', () => page.locator('[data-testid="journey-next"]').click())
await measure('zoom out (overview)', () => page.locator('[data-testid="journey-zoom"]').click())
await measure('zoom in (focus)', () => page.locator('[data-testid="journey-zoom"]').click())
await measure('key ArrowLeft', () => page.keyboard.press('ArrowLeft'))
await measure('key Home', () => page.keyboard.press('Home'))
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
await page.keyboard.press('End'); await page.waitForTimeout(1500); await measure('unthrottled prev', () => page.locator('[data-testid="journey-prev"]').click())
await measure('unthrottled overview', () => page.locator('[data-testid="journey-zoom"]').click())
await browser.close()
