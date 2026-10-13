import { chromium } from 'playwright'
import fs from 'fs'
import { MongoClient } from 'mongodb'
const { token } = JSON.parse(fs.readFileSync('/tmp/ph.json','utf8'))
const BASE = 'http://127.0.0.1:3320'
const OUT = 'tests/e2e/screenshots/flag-photo'
fs.mkdirSync(OUT, { recursive: true })
const mongo = new MongoClient('mongodb://127.0.0.1:27025/become-photo'); await mongo.connect()
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
await p.screenshot({ path: `${OUT}/1-row.png` })

// The trigger should now share the date row.
const trigger = p.getByRole('button', { name: /Something look wrong/i })
ok(await trigger.isVisible(), 'trigger visible')
const tBox = await trigger.boundingBox()
const nowChip = p.getByRole('button', { name: /Log date: now|Logging for/i }).first()
const nBox = await nowChip.boundingBox()
const sameLine = tBox && nBox && Math.abs((tBox.y + tBox.height/2) - (nBox.y + nBox.height/2)) < 14
ok(!!sameLine, `on the SAME LINE as the date picker (trigger y=${Math.round(tBox?.y ?? -1)}, chip y=${Math.round(nBox?.y ?? -1)})`)

// Photo upload, for real, through the blob store.
await trigger.click()
await p.waitForTimeout(900)
const addPhoto = p.getByRole('button', { name: /Add a photo of the label/i })
ok(await addPhoto.isVisible(), 'photo control present in the sheet')

// A tiny valid JPEG stands in for the panel shot.
const jpg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64')
fs.writeFileSync('/tmp/label.jpg', jpg)
await p.setInputFiles('input[type="file"]', '/tmp/label.jpg')
await p.waitForTimeout(4000)
await p.screenshot({ path: `${OUT}/2-photo.png` })
const attached = await p.getByText('Label attached').isVisible().catch(()=>false)
ok(attached, 'photo uploaded and attached')

await p.getByRole('button', { name: /^Report it$/i }).click()
await p.waitForTimeout(3500)
await p.screenshot({ path: `${OUT}/3-sent.png` })

const flag = await mongo.db().collection('foodflags').findOne({})
console.log('   flag photoUrl:', flag?.photoUrl)
ok(!!flag, 'report recorded')
ok(typeof flag?.photoUrl === 'string' && flag.photoUrl.includes('/api/blob/food-flags/'), 'photo URL persisted on the flag')

await b.close(); await mongo.close()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
