import { chromium } from 'playwright'
import { authenticate, api } from './nutrition-audit-lib.mjs'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
await authenticate(page, context)
const r = await api(page, 'POST', '/api/meal-logs', {
  source: 'manual', tags: ['breakfast'],
  items: [{ name: 'Scrambled Eggs', servingSize: 100, servingUnit: 'g', servings: 1.5, loggedQuantity: 150, loggedUnit: 'g', nutrition: { calories: 220, protein: 15, carbs: 2, fats: 16 } }],
})
console.log('STATUS', r.status)
console.log('BODY', r.text)
if (r.json?.log?._id) {
  const d = await api(page, 'DELETE', `/api/meal-logs/${r.json.log._id}`)
  console.log('DELETE seed', d.status)
}
await browser.close()
