import { chromium } from 'playwright'
import fs from 'fs'
const { token } = JSON.parse(fs.readFileSync('/tmp/ph.json','utf8'))
const BASE = 'http://127.0.0.1:3320'
const OUT = 'tests/e2e/screenshots/flag-photo'
const fails = []
const ok = (c,m)=>{ console.log(`${c?'PASS':'FAIL'}  ${m}`); if(!c) fails.push(m) }
const b = await chromium.launch({ channel: 'chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 430, height: 920 } })
ctx.setDefaultTimeout(25000)
await ctx.addInitScript((t)=>localStorage.setItem('token',t), token)
await ctx.addCookies([{ name:'auth_token', value: token, domain:'127.0.0.1', path:'/' }])
const p = await ctx.newPage()
await p.goto(`${BASE}/dashboard/nutrition`, { waitUntil:'domcontentloaded' })
await p.waitForTimeout(4500)
await p.getByRole('button', { name: /Search foods/i }).first().click()
await p.waitForTimeout(1200)
await p.getByPlaceholder(/Search/i).first().fill('original zero')
await p.waitForTimeout(2800)
await p.locator('div:has(> div > p:text-is("Original Zero"))').first().click().catch(async () => {
  await p.getByText('Original Zero').first().click({ force: true })
})
await p.waitForTimeout(2500)
await p.screenshot({ path: `${OUT}/layout.png` })
const trigger = p.getByRole('button', { name: /Something look wrong/i })
ok(await trigger.isVisible(), 'trigger visible')
const tBox = await trigger.boundingBox()
const chip = p.getByRole('button', { name: /Log date: now|Logging for/i }).first()
const cBox = await chip.boundingBox()
ok(!!(tBox && cBox && Math.abs((tBox.y+tBox.height/2)-(cBox.y+cBox.height/2)) < 14),
   `same line as the date picker (trigger ${Math.round(tBox?.y??-1)}, chip ${Math.round(cBox?.y??-1)})`)
ok(!!(tBox && cBox && tBox.x > cBox.x), 'sits to the right of the date chip')
await b.close()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
