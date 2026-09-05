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
const MONGO_DEPS = 'lib/billing/mongoDeps.ts'
const USER_MODEL = 'models/User.ts'

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


// ─── refusals: every one of these is a bill somebody pays twice ──────────────

test('checkout refuses a member who is already paying in this mode', () => {
  const src = read(CHECKOUT)
  assert.match(src, /already_subscribed/)
  assert.match(src, /sameMode/, 'a live subscriber must still be able to test on beta')
})

test('checkout refuses a member mid-dunning and points at the portal', () => {
  // past_due / unpaid / incomplete all derive to `free`, so the upgrade CTA is
  // showing and nothing about the member LOOKS subscribed. Letting them buy
  // opens a SECOND live subscription on one Stripe customer: both bill, and the
  // first one's terminal event downgrades someone the second is charging.
  const src = read(CHECKOUT)
  assert.match(src, /fix_payment_method/)
  for (const status of ['past_due', 'unpaid', 'incomplete']) {
    assert.match(src, new RegExp(`'${status}'`), `${status} must be refused`)
  }
  assert.match(src, /billing\/portal/, 'the way out of a failed payment is a card, not a purchase')
})

test('checkout refuses to sell Plus to someone who already has it', () => {
  // 64 of 66 members are grandfathered, and deriveTier pins admins to plus.
  const src = read(CHECKOUT)
  assert.match(src, /already_plus/)
  assert.match(src, /grandfathered/)
  assert.match(src, /role === 'admin'/)
})

// ─── the mode fence is written in exactly one place ──────────────────────────

test('the customer-id write never touches subscription.mode', () => {
  // `subscription.mode` is subscription STATE, owned by apply.ts, and it is the
  // field canApplyMode() reads to refuse a test event against live state.
  // Writing it from the checkout path meant merely OPENING checkout on beta
  // flipped a live subscriber to 'test' - after which beta's webhooks could
  // cancel a real, paying subscription.
  const src = read(MONGO_DEPS)
  assert.doesNotMatch(src, /'subscription\.mode'/, 'only apply.ts writes the mode')
})

test('the subscription write re-asserts the ordering check in its filter', () => {
  // The check in apply.ts is a read; between it and the write another delivery
  // can land, and the loser would overwrite newer state with older.
  const src = read(MONGO_DEPS)
  assert.match(src, /'subscription\.lastEventCreated': \{ \$lte: eventCreated \}/)
  assert.match(src, /matchedCount === 0/, 'a guard miss is a skip, never a throw')
  assert.doesNotMatch(src, /throw new Error\('stale/, 'a newer event already applied is not an error')
})

test('the Stripe id indexes are unique, or the webhook updates whoever Mongo returns first', () => {
  // findUserIdByRef resolves an event with one findOne on these fields. Two
  // users sharing a customer id means one member's payment silently grants or
  // revokes another's access, with nothing in the logs to say so. The partial
  // filter already excludes the nulls every signup writes, so unique is safe.
  const src = read(USER_MODEL)
  for (const field of [
    'subscription.stripeCustomerId',
    'subscription.stripeTestCustomerId',
    'subscription.stripeSubscriptionId',
  ]) {
    const declaration = new RegExp(
      `\\{ '${field.replace(/\./g, '\\.')}': 1 \\},\\s*\\{ unique: true, partialFilterExpression`,
    )
    assert.match(src, declaration, `${field} must be a UNIQUE partial index`)
  }
})
