import { chromium, devices } from '@playwright/test'
import { readFileSync } from 'fs'
const BASE = 'http://localhost:3210'
const TOKEN = readFileSync('/tmp/hb/jon.token', 'utf8').trim()
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => {
  const commits = []
  window.__commits = commits
  const hook = {
    renderers: new Map(), supportsFiber: true, _n: 0,
    inject(r) { const id = ++this._n; this.renderers.set(id, r); return id },
    onCommitFiberRoot(id, root) {
      const counts = {}; let performed = 0; let total = 0
      const walk = (f) => {
        while (f) {
          total++
          if (f.flags & 1) { performed++; const name = typeof f.type === 'function' ? (f.type.displayName || f.type.name || 'anon') : (f.type && f.type.render ? (f.type.render.name || 'fwd') : (typeof f.type === 'string' ? f.type : (f.type && f.type.type && f.type.type.name) || 'x')); counts[name] = (counts[name] ?? 0) + 1 }
          if (f.child) walk(f.child)
          f = f.sibling
        }
      }
      walk(root.current)
      commits.push({ t: performance.now(), performed, total, counts })
    },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {}, on() {}, off() {}, emit() {}, sub() { return () => {} },
    setStrictMode() {}, getFiberRoots() { return new Set() }, isDisabled: false, hasUnsupportedRendererAttached: false,
  }
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: hook, configurable: false, writable: false })
})
const page = await ctx.newPage()
const u = new URL(BASE)
await ctx.addCookies([{ name: 'auth_token', value: TOKEN, domain: u.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }])
await page.goto(`${BASE}/login`)
await page.evaluate(t => { localStorage.setItem('token', t); sessionStorage.setItem('becoming.opened', '1') }, TOKEN)
await page.goto(`${BASE}/dashboard/mind/becoming`, { waitUntil: 'domcontentloaded' })
await page.waitForResponse(r => r.url().includes('/api/becoming/journey') && r.ok(), { timeout: 120_000 })
await page.waitForFunction(() => document.querySelector('[data-testid="journey-stage"]')?.getAttribute('data-mode') === 'focus', null, { timeout: 15000 })
await page.waitForTimeout(2500)
async function count(label, fn) {
  await page.evaluate(() => { window.__commits.length = 0 })
  await fn()
  await page.waitForTimeout(1600)
  const c = await page.evaluate(() => window.__commits.map(c => ({ performed: c.performed, total: c.total, WeekCardImpl: c.counts.WeekCardImpl ?? 0, MotionComponent: (c.counts.MotionComponent ?? 0) + (c.counts.MotionDOMComponent ?? 0), Strip: c.counts.Strip ?? 0, JourneyCanvas: c.counts.JourneyCanvas ?? 0, top: Object.entries(c.counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`${k}:${v}`).join(',') })))
  console.log(`\n== ${label}: ${c.length} commits`); for (const x of c) console.log('  ', JSON.stringify(x))
}
await count('prev click', () => page.locator('[data-testid="journey-prev"]').click())
await count('next click', () => page.locator('[data-testid="journey-next"]').click())
await count('overview', () => page.locator('[data-testid="journey-zoom"]').click())
await count('focus', () => page.locator('[data-testid="journey-zoom"]').click())
// hint expiry
await count('hint idle wait (3.5s)', async () => { await page.waitForTimeout(3500) })
await browser.close()
