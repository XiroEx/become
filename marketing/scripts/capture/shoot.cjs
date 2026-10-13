// Read-only product capture for carousel work. Never prints the token.
// Usage: NODE_PATH=webapp/node_modules node marketing/scripts/capture/shoot.cjs <tokenfile> <path> <out.png> [viewportHeight=1200]
// - iPhone UA, 390px wide, DPR 2 (so a capture is 780px wide, the width the slide crops expect)
// - every non-GET request is aborted: pages that stamp records on load cannot write
// - fixed chrome pinned to the lower viewport (bottom nav, floating +) is hidden for a clean crop
const fs = require('fs');
const { chromium } = require('playwright');
const [tokenFile, route, out, vh = '1200'] = process.argv.slice(2);
if (!tokenFile || !route || !out) { console.error('usage: shoot.cjs <tokenfile> <path> <out.png> [viewportHeight]'); process.exit(1); }
const TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: Number(vh) }, deviceScaleFactor: 2, colorScheme: 'light',
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  await ctx.addCookies([{ name: 'auth_token', value: TOKEN, domain: 'become.redbtn.io', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  await ctx.addInitScript((tok) => { try { localStorage.setItem('token', tok); localStorage.setItem('auth_token', tok); } catch (e) {} }, TOKEN);
  await ctx.route('**/*', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('https://become.redbtn.io' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach((el) => {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.style.display = 'none';
    });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  console.log('captured', route, '->', out);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
