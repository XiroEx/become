# Capture Recipe

The literal run. Every command is bounded with `timeout`. All paths are repo-relative; run from
`webapp/` unless stated otherwise.

## 0. Preconditions

| Thing | Where | Note |
|---|---|---|
| `JWT_SECRET` | `webapp/.env.local` | Read by `tests/e2e/test-auth.ts`. Never printed. |
| Playwright | `webapp/package.json` devDependency | `npm run test:e2e` is `playwright test`. |
| `sharp` | `webapp/package.json` dependency | Already there. Do not add an image dependency. |
| Target | `https://become.redbtn.io` | `playwright.config.ts` `baseURL`, overridable with `PLAYWRIGHT_BASE_URL`. |

```bash
timeout 300 npm ci                     # only if node_modules is missing
timeout 600 npx playwright install chromium
```

## 1. Geometry

| Setting | Value | Why |
|---|---|---|
| Viewport | `390 x 844` | iPhone 14 class, the app's primary target |
| `deviceScaleFactor` | `2` | Retina. Raw output is `780 x 1688` |
| Ship width | `780` | Native 1:1 from the 2x capture. Never upscale from 390 |
| Format | `webp`, quality `84` | The v2 set lands 40 to 95 KB per shot at this setting |
| Theme | `colorScheme: 'light' | 'dark'` | The app follows `prefers-color-scheme` |

`fullPage: false` for hero shots (a clean 1688px tall frame). `fullPage: true` only when the
deliverable is a long scroll and the consumer will crop.

## 2. Spec file

Create `webapp/tests/e2e/<name>-shots.spec.ts`. The shape both existing shot specs use:

```ts
import { test } from '@playwright/test'
import { authenticate, BASE_URL, dismissTutorials, waitForAppScreen, signToken } from './test-auth'

test.use({ viewport: { width: 390, height: 844 } })
test.setTimeout(180_000)

const CAPTURE_TOKEN = signToken('<dummy-user-id>', 'playwright-test-mobile1@become.test')

const shots: Array<[string, string]> = [
  ['/dashboard', 'dashboard'],
  ['/dashboard/workout', 'workout-hub'],
]

test('marketing captures', async ({ page, context }) => {
  await authenticate(page, context, CAPTURE_TOKEN)
  for (const [path, name] of shots) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
    await waitForAppScreen(page)
    await dismissTutorials(page)
    await page.waitForTimeout(900)          // let motion settle
    await page.screenshot({ path: `/tmp/become-shots/${name}.png`, fullPage: false })
  }
})
```

Helpers exported by `tests/e2e/test-auth.ts`:

| Export | Does |
|---|---|
| `authenticate(page, context, token)` | Sets the `auth_token` cookie plus `localStorage.token`, navigates to `/dashboard`, clears an onboarding redirect, skips the daily check-in modal, then calls `dismissTutorials` |
| `waitForAppScreen(page)` | Waits until the body has real text (>= 120 chars), not a shell or loader |
| `dismissTutorials(page)` | Clicks the real "Skip tour" control until `.rtut-shield` is gone twice in a row. Call after every navigation |
| `signToken(userId, email)` | Mints a 7 day JWT from `JWT_SECRET` |
| `E2E_AUTH_TOKEN` | Token for `e2etest@become.io`, the account destructive fixtures may target |
| `AUTH_TOKEN` | A real human's account. **Do not use for captures** |
| `BASE_URL` | `PLAYWRIGHT_BASE_URL` or production |

## 3. Playwright project

Add two projects to `webapp/playwright.config.ts`, one per theme:

```ts
{
  name: 'marketing-shots-light',
  testMatch: '**/<name>-shots.spec.ts',
  timeout: 300_000,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: 'light',
    video: 'off', trace: 'off', screenshot: 'off',
  },
},
```

Duplicate with `colorScheme: 'dark'` and a `-dark` name. Two projects, not two tests: a failure in
one theme then does not orphan its twin. `becoming-journey` in the existing config is the closest
model for the mobile `use` block.

## 4. Run

```bash
timeout 900 npx playwright test --project=marketing-shots-light --reporter=list
timeout 900 npx playwright test --project=marketing-shots-dark  --reporter=list
```

Never wrap these in a poll loop. If a run needs longer than 900s, the spec is doing too much;
split it.

## 5. Auth for an account the harness does not know

`test-auth.ts` only carries two hardcoded user ids. For any other dummy account, let the **server**
mint the token instead of guessing an id:

1. Insert a `MagicLink` document for the dummy address into the production database (the model
   lives at `webapp/models/MagicLink.ts`: a 64 char `token`, a 32 char `sessionId`, 15 minute TTL).
2. `POST /api/auth/verify-link` with that token. The route validates it, creates or loads the user,
   and returns a JWT signed the same way production signs every real login.
3. Use that JWT as the capture token. Delete the `MagicLink` row; the TTL index will do it anyway.

Do not write the connection string, the token, or the JWT anywhere. Read the connection string
from the runtime config the app itself uses, hold it in the process, and never echo it.

## 6. Post-process to webp

From the repo root, with `sharp` resolved out of `webapp/node_modules`:

```bash
timeout 300 node -e "
const sharp = require('./webapp/node_modules/sharp');
const fs = require('fs');
const src = '/tmp/become-shots';
const dst = 'webapp/public/screenshots/v2';
(async () => {
  for (const f of fs.readdirSync(src).filter(n => n.endsWith('.png'))) {
    const out = dst + '/' + f.replace(/\.png$/, '.webp');
    const info = await sharp(src + '/' + f).resize({ width: 780 }).webp({ quality: 84 }).toFile(out);
    console.log(out, info.width + 'x' + info.height, Math.round(fs.statSync(out).size / 1024) + 'KB');
  }
})();
"
```

Naming: `<screen>-<theme>.webp`, lowercase, hyphenated. The existing set is `dashboard-light`,
`dashboard-dark`, `workout-hub-light`, `workout-hub-dark`, `workout-log-dark`, `generate-light`,
`generate-dark`, `nutrition-day-light`, `nutrition-day-dark`, `nutrition-meal-light`,
`nutrition-meal-dark`, `mind-light`, `mind-dark`, `progress-light`, `progress-dark`.

## 7. Manifest

Append to `webapp/public/screenshots/v2/manifest.json`. Schema and a filled example are in
`references/manifest-schema.md`. Update `capturedAt`, add to `shots`, extend `seeding.writes` with
every API call the run made, and add to `knownIssues` if anything was patched.

## 8. Verify

```bash
timeout 60 node -e "
const sharp=require('./webapp/node_modules/sharp'),fs=require('fs');
const d='webapp/public/screenshots/v2';
(async()=>{for(const f of fs.readdirSync(d).filter(n=>n.endsWith('.webp'))){
  const m=await sharp(d+'/'+f).metadata();
  console.log(f,m.width+'x'+m.height,Math.round(fs.statSync(d+'/'+f).size/1024)+'KB');
}})();
"
timeout 30 node -e "JSON.parse(require('fs').readFileSync('webapp/public/screenshots/v2/manifest.json','utf8')); console.log('manifest ok')"
```

Then open the light and dark twin side by side and confirm the same content, same scroll, same
carousel slide. That check is visual and cannot be automated away.
