// Run with: npx tsx --test tests/unit/billing/billingRoutes.test.ts
//
// Source-text assertions (the repo idiom — see tests/unit/customExerciseRole.test.ts).
// Booting a Next route handler here would need a request, a database and a
// Stripe account; what actually breaks in practice is WIRING, and wiring is
// visible in the source.
//
// The first assertion is the one that matters most: reading the webhook body
// with request.json() instead of request.text() re-serializes it, the HMAC no
// longer matches the raw bytes Stripe signed, and every delivery 400s. It looks
// like a secret problem and it is not.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const WEBHOOK = 'app/api/billing/webhook/route.ts'
const CHECKOUT = 'app/api/billing/checkout/route.ts'
const PORTAL = 'app/api/billing/portal/route.ts'
const STATUS = 'app/api/billing/status/route.ts'

test('the webhook reads the RAW body and never re-parses it', () => {
  const src = read(WEBHOOK)
  assert.match(src, /await request\.text\(\)/, 'raw bytes are what the signature covers')
  assert.doesNotMatch(src, /await request\.json\(\)/, 'json() re-serializes and breaks the HMAC')
})

test('the webhook pins the node runtime', () => {
  // constructEvent is node-crypto. On edge it does not exist.
  assert.match(read(WEBHOOK), /export const runtime = ['"]nodejs['"]/)
})

test('every billing route is force-dynamic', () => {
  for (const rel of [WEBHOOK, CHECKOUT, PORTAL, STATUS]) {
    assert.match(read(rel), /export const dynamic = ['"]force-dynamic['"]/, rel)
  }
})

test('the signature is the webhook’s only auth — it must NOT call verifyAuth', () => {
  // Stripe cannot present a JWT. A verifyAuth here would 401 every delivery.
  assert.doesNotMatch(read(WEBHOOK), /verifyAuth\(/)
  // ...and it must verify the signature instead of trusting the body.
  assert.match(read(WEBHOOK), /verifyStripeSignature\(/)
})

test('every other billing route DOES authenticate', () => {
  for (const rel of [CHECKOUT, PORTAL, STATUS]) {
    assert.match(read(rel), /verifyAuth\(/, rel)
  }
})

test('checkout creates a subscription session with the fields the webhook relies on', () => {
  const src = read(CHECKOUT)
  assert.match(src, /mode:\s*['"]subscription['"]/)
  // client_reference_id is the primary attribution path in the reducer.
  assert.match(src, /client_reference_id/)
  // subscription_data.metadata is what puts userId on every later event.
  assert.match(src, /subscription_data:\s*\{\s*metadata/)
  // Promo codes are made in the dashboard, never hardcoded here.
  assert.match(src, /allow_promotion_codes:\s*true/)
  assert.match(src, /idempotencyKey/)
})

test('checkout and portal both answer with the one 503 helper', () => {
  for (const rel of [CHECKOUT, PORTAL]) {
    assert.match(read(rel), /billingNotConfigured\(/, rel)
  }
})

test('the portal maps the missing-dashboard-configuration failure explicitly', () => {
  // Unmapped, it surfaces as a generic 500 and reads as a bug in this route
  // rather than a setup step nobody has done in the Stripe dashboard.
  const src = read(PORTAL)
  assert.match(src, /isPortalConfigurationError\(/)
  assert.match(src, /billing_portal_not_configured/)
})

test('status answers 200 when unconfigured — never 503', () => {
  const src = read(STATUS)
  assert.match(src, /configured:\s*cfg\.configured/)
  assert.doesNotMatch(src, /billingNotConfigured\(/, 'a 503 here reads as an outage, not "not yet"')
})

test('status leaks no Stripe identifiers to the client', () => {
  const src = read(STATUS)
  // Presence flags only. Customer/subscription/price ids and keys have no
  // client use and every one of them is a support-channel leak waiting to happen.
  assert.doesNotMatch(src, /stripeSubscriptionId:/)
  assert.doesNotMatch(src, /secretKey/)
  assert.match(src, /monthly:\s*Boolean\(cfg\.prices\.monthly\)/)
})

test('no apiVersion literal anywhere under lib/billing', () => {
  // StripeConfig types apiVersion as the literal LatestApiVersion, so a
  // hardcoded date string breaks tsc on the next SDK bump. The SDK's pinned
  // version is correct by construction.
  const dir = path.join(ROOT, 'lib/billing')
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts')) continue
    assert.doesNotMatch(
      fs.readFileSync(path.join(dir, file), 'utf8'),
      /apiVersion\s*:/,
      `${file} must not pin an API version`,
    )
  }
})

test('deriveTier is imported in exactly one place in billing', () => {
  // The whole point of injecting it: if the tier model moves, this is the one
  // line that changes and every billing unit test still passes.
  const dir = path.join(ROOT, 'lib/billing')
  const importers = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /from ['"]@\/lib\/subscription['"]/.test(fs.readFileSync(path.join(dir, f), 'utf8')))

  assert.deepEqual(importers, ['mongoDeps.ts'])
})
