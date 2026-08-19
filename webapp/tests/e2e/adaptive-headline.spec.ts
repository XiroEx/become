import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import jwt from 'jsonwebtoken'
const BASE='https://become.redbtn.io', USER='69324119a28a8ac3b78750b9'

test('adaptive session is the headline across all 4 systems', async ({ page, context }) => {
  const errs:string[]=[]
  page.on('pageerror', e=>errs.push('PAGEERR '+String(e).slice(0,120)))
  const env=readFileSync('.env.local','utf8'); const secret=env.match(/^JWT_SECRET=(.*)$/m)![1].trim().replace(/^["']|["']$/g,'')
  const token=jwt.sign({userId:USER,email:'a@become.local'},secret,{expiresIn:'20m'})
  await context.addCookies([{name:'auth_token',value:token,domain:'become.redbtn.io',path:'/',httpOnly:false,secure:true,sameSite:'Lax'}])
  await page.goto(`${BASE}/login`); await page.evaluate((t)=>localStorage.setItem('token',t),token)

  for (const sec of ['state-shift','discipline','anti-sabotage','self-image']) {
    await page.goto(`${BASE}/dashboard/mind/${sec}`,{waitUntil:'domcontentloaded'})
    await page.locator('button[aria-label="Skip tour"]').first().click({force:true}).catch(()=>{})
    await page.waitForTimeout(2200)
    const headline = page.locator('text=/Today.?s session . built for you/i').first()
    const present = await headline.isVisible().catch(()=>false)
    const oldBtn = await page.locator('button:has-text("Personalize with AI")').count()
    console.log(`${sec}: adaptive headline=${present}  old "Personalize" button=${oldBtn}`)
    expect(present).toBe(true)
    expect(oldBtn).toBe(0)
  }
  await page.goto(`${BASE}/dashboard/mind/state-shift`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(2000)
  await page.locator('button[aria-label="Skip tour"]').first().click({force:true}).catch(()=>{})
  await page.screenshot({path:'tests/e2e/screenshots/adaptive-headline.png', fullPage:true})
  console.log('ERRORS:', errs.length?JSON.stringify(errs):'none')
  expect(errs).toEqual([])
})
