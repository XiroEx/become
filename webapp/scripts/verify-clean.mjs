import { chromium } from 'playwright'
import { authenticate, api } from './nutrition-audit-lib.mjs'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
await authenticate(page, context)
const tz = new Date().getTimezoneOffset()
const key = new Date().toISOString().slice(0,10)
const r = await api(page, 'GET', `/api/meal-logs?date=${key}&tz=${tz}`)
console.log('today logs:', (r.json?.logs||[]).length, 'totals:', JSON.stringify(r.json?.dailyTotals))
const mine = await api(page, 'GET', '/api/me/foods')
const foods = mine.json?.foods || mine.json?.items || (Array.isArray(mine.json)?mine.json:[])
console.log('my foods:', (foods||[]).map(f=>f.name||f.food?.name))
await browser.close()
