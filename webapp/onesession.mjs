import { chromium } from '@playwright/test'
import jwt from 'jsonwebtoken'
import fs from 'fs'
const env={}
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,'').trim() }
const t = jwt.sign({userId:'6a73f4b9b1d73f4a3f8d5a70',email:'nadine@redbtn.io',role:'admin'}, env.JWT_SECRET, {expiresIn:'6h'})
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}})
await ctx.addCookies([{name:'auth_token',value:t,domain:'localhost',path:'/',secure:false,sameSite:'Lax'}])
const page = await ctx.newPage()
page.on('pageerror', e=>console.log('[JS-ERROR]', String(e).slice(0,160)))
page.on('response', r=>{ if(r.status()>=500) console.log('[5xx]', r.status(), r.url().replace('http://localhost:3120','')) })
await page.addInitScript(x=>localStorage.setItem('token',x), t)
const txt = ()=>page.evaluate(()=>document.body.innerText.replace(/\n{2,}/g,'\n').trim())

await page.goto('http://localhost:3120/dashboard/mind',{waitUntil:'domcontentloaded'})
await page.waitForTimeout(6000)
const opened = await page.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>/Session \d+ of \d+/i.test(b.textContent||'')); if(el){el.click();return true} return false})
console.log('opened session card:', opened)
await page.waitForTimeout(7000)
console.log('--- after open ---'); console.log((await txt()).slice(0,400))

for (let i=0;i<22;i++){
  const t0 = await txt()
  if (/Where are you right now/i.test(t0)) {
    await page.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='Tired'); if(el)el.click()})
    console.log(`beat ${i}: picked Tired`); await page.waitForTimeout(3000); continue
  }
  const acted = await page.evaluate(()=>{
    const ta=document.querySelector('textarea')
    if(ta && ta.offsetParent!==null && !ta.value){const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; s.call(ta,'Three days a week. I keep quitting on myself and I am done with that.'); ta.dispatchEvent(new Event('input',{bubbles:true})); return 'typed'}
    const btns=[...document.querySelectorAll('button')].filter(x=>!x.disabled&&x.offsetParent!==null)
    const go=btns.find(x=>/^(continue|next|finish|done|got it|let's go|i'm ready|begin|hold|start)/i.test((x.textContent||'').trim().toLowerCase()))
    if(go){go.click();return (go.textContent||'').trim().slice(0,28)}
    const any=btns.find(x=>(x.textContent||'').trim().length>2 && !/^(skip|exit|close|back|×)/i.test((x.textContent||'').trim().toLowerCase()))
    if(any){any.click();return (any.textContent||'').trim().slice(0,28)}
    return null
  })
  if(!acted){console.log(`beat ${i}: no control`);break}
  await page.waitForTimeout(2800)
  console.log(`beat ${i}: [${acted}] -> ${(await txt()).split('\n').filter(Boolean).slice(0,2).join(' | ').slice(0,120)}`)
  if(/that counts|session complete|nice work|see you tomorrow|Done for now/i.test(await txt())){console.log('COMPLETED');break}
}
await page.screenshot({path:'tests/e2e/screenshots/nadine/30-session-run.png',fullPage:true})
console.log('--- final ---'); console.log((await txt()).slice(0,700))
await b.close()
