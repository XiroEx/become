// Run with: npm run test:file tests/unit/billing/billingConfig.test.ts
//
// The first test in this file is the reason the file exists.
//
// lib/runtimeConfig.ts has two helpers: required(), which THROWS, and
// optional(), which does not. One required() in the billing block turns "we
// haven't set Stripe up yet" into getRuntimeConfig() throwing — and per
// AGENTS.md that 401s every authenticated route while AuthGuard, which only
// checks token expiry client-side, still renders the page. The app looks
// completely fine and every list is silently empty. That is the single worst
// outcome available to this stage, and it is one word away at all times.
//
// getRuntimeConfig memoizes at module scope, so each case runs in its own
// subprocess — the idiom is lifted straight from tests/unit/runtimeConfig.test.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const TSX_CLI = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs')

const BASE_ENV = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/become-test',
  JWT_SECRET: 'test-only-secret-that-is-not-a-default',
} as const

// Fake, non-functional values. Shaped like the real thing so prefix detection is
// exercised; short enough that the secret-hygiene scanner ignores them.
const FAKE_KEY_TEST = 'sk_test_becomeunittestfake'
const FAKE_KEY_LIVE = 'sk_live_becomeunittestfake'

function runIsolated(code: string, env: Partial<NodeJS.ProcessEnv> = {}) {
  return spawnSync(process.execPath, [TSX_CLI, '--eval', code], {
    cwd: process.cwd(),
    env: { ...process.env, ...BASE_ENV, ...env },
    encoding: 'utf8',
  })
}

/** Wrap an assertion body so a failure surfaces as a readable stderr line. */
function program(body: string): string {
  return [
    "import { getRuntimeConfig } from './lib/runtimeConfig.ts';",
    // Scrub any STRIPE_* the developer happens to have exported, so "no billing
    // config" really means none.
    'for (const k of Object.keys(process.env)) if (k.startsWith("STRIPE_")) delete process.env[k];',
    '(async () => { try {',
    body,
    '} catch (e) { console.error(String(e && e.message || e)); process.exitCode = 1 } })()',
  ].join('\n')
}

test('an unconfigured billing section resolves — it does NOT throw', () => {
  const result = runIsolated(
    program(`
      const config = await getRuntimeConfig()
      if (config.billing === undefined) throw new Error('billing section missing entirely')
      if (config.billing.stripeSecretKey !== undefined) throw new Error('expected no secret key')
      if (config.billing.stripeWebhookSecret !== undefined) throw new Error('expected no webhook secret')
      if (config.billing.stripeMode !== 'test') throw new Error('expected mode test, got ' + config.billing.stripeMode)
      if (config.auth.jwtSecret !== ${JSON.stringify(BASE_ENV.JWT_SECRET)}) throw new Error('unrelated config broke')
    `),
  )
  assert.equal(result.status, 0, result.stderr)
})

test('local env values resolve through the billing block', () => {
  const result = runIsolated(
    `import { getRuntimeConfig } from './lib/runtimeConfig.ts';
     (async () => { try {
       const c = await getRuntimeConfig()
       if (c.billing.stripeSecretKey !== ${JSON.stringify(FAKE_KEY_TEST)}) throw new Error('secret key')
       if (c.billing.stripeWebhookSecret !== 'whsec_become_unit_test_secret') throw new Error('webhook secret')
       if (c.billing.stripePricePlusMonthly !== 'price_unit_monthly') throw new Error('monthly price')
       if (c.billing.stripePricePlusAnnual !== 'price_unit_annual') throw new Error('annual price')
       if (c.billing.stripeMode !== 'test') throw new Error('mode')
     } catch (e) { console.error(String(e && e.message || e)); process.exitCode = 1 } })()`,
    {
      STRIPE_SECRET_KEY: FAKE_KEY_TEST,
      STRIPE_WEBHOOK_SECRET: 'whsec_become_unit_test_secret',
      STRIPE_PRICE_PLUS_MONTHLY: 'price_unit_monthly',
      STRIPE_PRICE_PLUS_ANNUAL: 'price_unit_annual',
    },
  )
  assert.equal(result.status, 0, result.stderr)
})

test('a live key forces live mode even when STRIPE_MODE says test', () => {
  const result = runIsolated(
    `import { getRuntimeConfig } from './lib/runtimeConfig.ts';
     (async () => { try {
       const c = await getRuntimeConfig()
       if (c.billing.stripeMode !== 'live') throw new Error('expected live, got ' + c.billing.stripeMode)
     } catch (e) { console.error(String(e && e.message || e)); process.exitCode = 1 } })()`,
    { STRIPE_SECRET_KEY: FAKE_KEY_LIVE, STRIPE_MODE: 'test' },
  )
  assert.equal(result.status, 0, result.stderr)
})

test('a test key forces test mode even when STRIPE_MODE says live', () => {
  const result = runIsolated(
    `import { getRuntimeConfig } from './lib/runtimeConfig.ts';
     (async () => { try {
       const c = await getRuntimeConfig()
       if (c.billing.stripeMode !== 'test') throw new Error('expected test, got ' + c.billing.stripeMode)
     } catch (e) { console.error(String(e && e.message || e)); process.exitCode = 1 } })()`,
    { STRIPE_SECRET_KEY: FAKE_KEY_TEST, STRIPE_MODE: 'live' },
  )
  assert.equal(result.status, 0, result.stderr)
})

test('billingNotConfigured is the one 503 shape both routes answer with', async () => {
  const { billingNotConfigured } = await import('../../../lib/billing/config')
  const res = billingNotConfigured()
  assert.equal(res.status, 503)
  const body = (await res.json()) as Record<string, unknown>
  assert.deepEqual(body, { error: 'billing_not_configured' })
})

test('priceIdForPlan / planForPriceId round-trip, and an unknown price is undefined', async () => {
  const { planForPriceId, priceIdForPlan } = await import('../../../lib/billing/config')
  const cfg = {
    configured: true,
    mode: 'test' as const,
    prices: { monthly: 'price_unit_monthly', annual: 'price_unit_annual' },
  }

  assert.equal(priceIdForPlan(cfg, 'monthly'), 'price_unit_monthly')
  assert.equal(priceIdForPlan(cfg, 'annual'), 'price_unit_annual')
  assert.equal(planForPriceId(cfg, 'price_unit_monthly'), 'monthly')
  assert.equal(planForPriceId(cfg, 'price_unit_annual'), 'annual')

  // A price renamed in the Stripe dashboard must NOT resolve to a plan — and
  // must not throw either, because status is what decides tier.
  assert.equal(planForPriceId(cfg, 'price_someone_renamed_this'), undefined)
  assert.equal(planForPriceId(cfg, null), undefined)
  assert.equal(planForPriceId(cfg, undefined), undefined)

  // An unconfigured cfg has no prices at all; nothing here may throw on it.
  const empty = { configured: false, mode: 'test' as const, prices: {} }
  assert.equal(priceIdForPlan(empty, 'monthly'), undefined)
  assert.equal(planForPriceId(empty, 'price_unit_monthly'), undefined)
})
