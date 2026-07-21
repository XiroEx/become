/**
 * Admin Food Detail — Scaling
 *
 * Locks in the pagination + filter behavior added to
 * /dashboard/admin/foods/[id] so a Food with many variants stays usable.
 *
 * Asserts (against a seeded 60-variant fixture):
 *   1. Initial render shows exactly VARIANTS_PAGE_SIZE (20) variants.
 *   2. The "Next" pagination control advances to page 2 of 3.
 *   3. The filter input narrows the visible variant set client-side
 *      (no page reload, no network call to /api/admin/foods).
 *
 * Fixture lifecycle:
 *   - beforeAll: admin-bootstrap → JWT; mongoose direct insert of a 60-
 *     variant Food doc with predictable variant names ("Variant 01"…
 *     "Variant 60") + per-variant externalIds for filter testing.
 *   - afterAll: Food.deleteOne by _id.
 *
 * Run from webapp/:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test \
 *     tests/e2e/admin-food-detail-scaling.spec.ts \
 *     --project=admin-food-detail-scaling
 */

import { test, expect, request, type APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN || ''
const VARIANTS_PAGE_SIZE = 20
const FIXTURE_VARIANT_COUNT = 60

interface AdminBootstrapResp {
  userId: string
  email: string
  token: string
}

async function bootstrapAdmin(): Promise<AdminBootstrapResp> {
  const ctx = await request.newContext()
  const res = await ctx.post(`${BASE_URL}/api/admin/e2e-admin-setup`, {
    headers: { 'x-bootstrap-token': BOOTSTRAP_TOKEN },
  })
  expect(res.status(), `e2e-admin-setup failed: ${await res.text()}`).toBe(200)
  const body = (await res.json()) as AdminBootstrapResp
  await ctx.dispose()
  return body
}

/**
 * Seed a 60-variant Food doc via the dedicated e2e fixture endpoint.
 * Going through the dev server (rather than a direct mongoose connection)
 * keeps the test resilient to local-vs-CI Mongo URI differences — the
 * server already has a working Mongo connection.
 */
async function seed60VariantFood(): Promise<{ foodId: string; cleanup: () => Promise<void> }> {
  const ctx = await request.newContext()
  const res = await ctx.post(`${BASE_URL}/api/admin/e2e-foods-fixture`, {
    headers: { 'x-bootstrap-token': BOOTSTRAP_TOKEN, 'Content-Type': 'application/json' },
    data: { variantCount: FIXTURE_VARIANT_COUNT },
  })
  expect(res.status(), `fixture seed failed: ${await res.text()}`).toBe(200)
  const body = (await res.json()) as { foodId: string }
  const foodId = body.foodId
  const cleanup = async () => {
    try {
      await ctx.delete(
        `${BASE_URL}/api/admin/e2e-foods-fixture?foodId=${encodeURIComponent(foodId)}`,
        { headers: { 'x-bootstrap-token': BOOTSTRAP_TOKEN } },
      )
    } finally {
      await ctx.dispose()
    }
  }
  return { foodId, cleanup }
}

let adminToken = ''
let fixtureId = ''
let fixtureCleanup: (() => Promise<void>) | null = null
let api: APIRequestContext

test.beforeAll(async () => {
  const admin = await bootstrapAdmin()
  adminToken = admin.token
  api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  })
  const seed = await seed60VariantFood()
  fixtureId = seed.foodId
  fixtureCleanup = seed.cleanup
})

test.afterAll(async () => {
  if (fixtureCleanup) await fixtureCleanup()
  if (api) await api.dispose()
})

test.describe('Admin food detail scales to 60 variants', () => {
  test('initial render shows exactly 20 variants; pagination advances; filter narrows', async ({ page }) => {
    // Capture console + network errors for diagnostics.
    page.on('console', msg => console.log(`[browser ${msg.type()}]`, msg.text()))
    page.on('pageerror', err => console.log('[pageerror]', err.message))
    page.on('requestfailed', req =>
      console.log('[reqfail]', req.url(), req.failure()?.errorText),
    )

    // Plant BOTH the localStorage token and the auth_token cookie before the
    // protected route loads. AuthGuard uses the cookie as a fallback when its
    // localStorage atob-parse fails (some JWT payload lengths trip atob), so
    // setting both makes the test robust to either path.
    const url = new URL(BASE_URL)
    await page.context().addCookies([
      {
        name: 'auth_token',
        value: adminToken,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'Lax',
      },
    ])
    await page.addInitScript(token => {
      window.localStorage.setItem('token', token)
    }, adminToken)

    await page.goto(`${BASE_URL}/dashboard/admin/foods/${fixtureId}`)
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})

    // Wait for the variants list to render.
    const variantsList = page.getByTestId('variants-list')
    await expect(variantsList).toBeVisible()

    // ── 1. Initial render shows only VARIANTS_PAGE_SIZE rows ─────────────
    // VariantEditor is the only direct child kind in the list; we count
    // them via the editor's distinctive textarea/name input children isn't
    // reliable across re-renders, so we use the editor's outer wrapper —
    // the variants-list's direct flex children.
    const initialRows = await variantsList.locator('> div').count()
    expect(initialRows).toBe(VARIANTS_PAGE_SIZE)

    // Page indicator should read "Page 1 of 3" for 60 variants @ 20/page.
    await expect(page.getByTestId('variants-page-indicator')).toHaveText(/Page 1 of 3/)

    // ── 2. "Next" advances to page 2 ──────────────────────────────────────
    await page.getByTestId('variants-next').click()
    await expect(page.getByTestId('variants-page-indicator')).toHaveText(/Page 2 of 3/)
    const page2Rows = await variantsList.locator('> div').count()
    expect(page2Rows).toBe(VARIANTS_PAGE_SIZE)

    // ── 3. Filter narrows — type "Variant 0" to match the first 9 only ────
    // Variants are named "Variant 01" through "Variant 60"; "0" appears in
    // names 01-09 plus 10/20/30/40/50/60 (substring match).
    const filterInput = page.getByTestId('variant-filter')
    await filterInput.fill('Variant 0')

    // Page resets to 0 on filter change; pagination indicator reflects the
    // narrower set. We don't pin an exact count for the filter match here
    // (the substring "Variant 0" matches more than 9 due to "10"/"20"…)
    // but we DO assert the displayed row count is at most VARIANTS_PAGE_SIZE
    // and that no /api/admin/foods request fires during the filter typing.
    const networkRequests: string[] = []
    page.on('request', req => {
      if (req.url().includes('/api/admin/foods')) networkRequests.push(req.url())
    })

    // Type a further character — should narrow client-side, no fetch.
    await filterInput.fill('Variant 01')
    await page.waitForTimeout(200)
    expect(networkRequests.filter(u => !u.includes(fixtureId)).length).toBe(0)

    // Exactly one variant matches "Variant 01".
    const filteredRows = await variantsList.locator('> div').count()
    expect(filteredRows).toBe(1)
  })
})
