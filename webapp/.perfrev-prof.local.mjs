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
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
async function prof(label, fn) {
  await cdp.send('Profiler.start')
  await fn()
  await page.waitForTimeout(1500)
  const { profile } = await cdp.send('Profiler.stop')
  // self time per function
  const self = new Map(); const total = new Map()
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children ?? [])) parent.set(c, n.id)
  const dt = profile.timeDeltas; const samples = profile.samples
  let sumAll = 0
  for (let i = 0; i < samples.length; i++) {
    const d = (dt[i] ?? 0) / 1000; sumAll += d
    const n = byId.get(samples[i]); const key = `${n.callFrame.functionName || '(anon)'} @${(n.callFrame.url||'').split('/').slice(-1)[0].split('?')[0]}:${n.callFrame.lineNumber}`
    self.set(key, (self.get(key) ?? 0) + d)
    // total: walk up
    let cur = samples[i]; const seen = new Set()
    while (cur != null) { const nn = byId.get(cur); const k = nn.callFrame.functionName || '(anon)'; if (!seen.has(k)) { total.set(k, (total.get(k) ?? 0) + d); seen.add(k) } cur = parent.get(cur) }
  }
  const top = [...self.entries()].sort((a,b) => b[1]-a[1]).slice(0, 18).map(([k,v]) => `${Math.round(v)}ms ${k}`)
  const interesting = ['WeekCardImpl','JourneyCanvas','Strip','Sparkline','HorizonCard','renderWithHooks','performWorkOnRoot','commitRoot','flyTo','weekColor','(idle)','(program)','(garbage collector)']
  const tot = interesting.map(k => `${k}=${Math.round(total.get(k) ?? 0)}`).join(' ')
  console.log(`\n== ${label} (sampled ${Math.round(sumAll)}ms)\n  totals: ${tot}\n  self top:\n   ` + top.join('\n   '))
}
await prof('prev click', () => page.locator('[data-testid="journey-prev"]').click())
await prof('next click', () => page.locator('[data-testid="journey-next"]').click())
await prof('overview', () => page.locator('[data-testid="journey-zoom"]').click())
await prof('focus', () => page.locator('[data-testid="journey-zoom"]').click())
await browser.close()
