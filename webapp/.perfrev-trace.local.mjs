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
await page.evaluate(t => { localStorage.setItem('token', t); sessionStorage.setItem('becoming.opened', '1') }, TOKEN)
await page.goto(`${BASE}/dashboard/mind/becoming`, { waitUntil: 'domcontentloaded' })
await page.waitForResponse(r => r.url().includes('/api/becoming/journey') && r.ok(), { timeout: 120_000 })
await page.waitForFunction(() => document.querySelector('[data-testid="journey-stage"]')?.getAttribute('data-mode') === 'focus', null, { timeout: 15000 })
await page.waitForTimeout(2000)
const cdp = await ctx.newCDPSession(page)
async function traced(label, fn) {
  const events = []
  cdp.on('Tracing.dataCollected', d => events.push(...d.value))
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })
  await fn()
  await page.waitForTimeout(1500)
  await cdp.send('Tracing.end')
  await new Promise(r => cdp.once('Tracing.tracingComplete', r))
  cdp.removeAllListeners('Tracing.dataCollected')
  const sum = {}
  const names = ['FunctionCall','EventDispatch','TimerFire','FireAnimationFrame','UpdateLayoutTree','Layout','Paint','PrePaint','Layerize','Commit','UpdateLayer','CompositeLayers','RasterTask','ImageDecode','RunTask']
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue
    if (!names.includes(e.name)) continue
    sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000
  }
  const tasks = events.filter(e => e.name === 'RunTask' && e.ph === 'X' && e.dur > 50000).map(e => Math.round(e.dur/1000))
  console.log(label, Object.fromEntries(Object.entries(sum).map(([k,v]) => [k, Math.round(v)])), 'longRunTasks(ms):', tasks)
}
await traced('prev click', () => page.locator('[data-testid="journey-prev"]').click())
await traced('next click', () => page.locator('[data-testid="journey-next"]').click())
await traced('overview', () => page.locator('[data-testid="journey-zoom"]').click())
await traced('focus', () => page.locator('[data-testid="journey-zoom"]').click())
await browser.close()
