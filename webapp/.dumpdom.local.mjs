import { chromium } from '@playwright/test'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
await p.addInitScript(() => {
  const inject = () => {
    if (document.getElementById('__e2e_hide_dev_overlay')) return
    const host = document.head || document.documentElement
    if (!host) return
    const s = document.createElement('style')
    s.id = '__e2e_hide_dev_overlay'
    s.textContent = 'nextjs-portal,[data-nextjs-toast]{display:none!important}'
    host.appendChild(s)
  }
  inject()
  document.addEventListener('DOMContentLoaded', inject)
})
await p.goto('http://localhost:3210/dashboard/nutrition', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(5000)
console.log(JSON.stringify(await p.evaluate(() => {
  const el = document.querySelector('nextjs-portal')
  return { display: el ? getComputedStyle(el).display : 'absent', styleTags: Array.from(document.querySelectorAll('style')).filter(s => s.textContent.includes('nextjs-portal')).length }
}), null, 1))
await b.close()
