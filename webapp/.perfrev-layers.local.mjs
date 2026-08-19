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
await page.waitForTimeout(2500)
const cdp = await ctx.newCDPSession(page)
await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
let layers = null
cdp.on('LayerTree.layerTreeDidChange', e => { layers = e.layers })
await cdp.send('LayerTree.enable')
await page.waitForTimeout(800)
async function report(label) {
  await page.waitForTimeout(500)
  const ls = layers ?? []
  let px = 0
  const big = []
  for (const l of ls) { const area = l.width * l.height; px += area; if (area > 200000) big.push(`${Math.round(l.width)}x${Math.round(l.height)}${l.backendNodeId ? '' : ''}`) }
  // compositing reasons for the biggest layers
  const reasons = {}
  for (const l of ls.filter(l => l.width * l.height > 200000).slice(0, 12)) {
    try { const r = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }); const key = (r.compositingReasonIds ?? r.compositingReasons ?? []).join(','); reasons[key] = (reasons[key] ?? 0) + 1 } catch {}
  }
  console.log(`\n== ${label}: ${ls.length} layers, total ${Math.round(px / 1e6)} Mpx (~${Math.round(px * 4 / 1048576)} MB at 4B/px)`)
  console.log('  big layers:', big.slice(0, 20).join(' '))
  console.log('  reasons:', JSON.stringify(reasons))
}
await report('focus idle')
const veil = await page.evaluate(() => { const els = [...document.querySelectorAll('[data-testid="journey-stage"] > div')]; return els.map(e => { const cs = getComputedStyle(e); return { cls: e.className.slice(0, 40), bf: cs.backdropFilter, op: cs.opacity } }).filter(x => x.bf && x.bf !== 'none') })
console.log('  elements with backdrop-filter after intro:', JSON.stringify(veil))
await page.locator('[data-testid="journey-zoom"]').click()
await page.waitForTimeout(1500)
await report('overview idle')
await page.locator('[data-testid="journey-zoom"]').click()
await page.waitForTimeout(1500)
await report('back to focus idle')
await browser.close()
