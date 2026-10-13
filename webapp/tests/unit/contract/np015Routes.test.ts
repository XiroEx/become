// Run with: npm run test:file tests/unit/contract/np015Routes.test.ts
//
// THE NP-015 SURFACE, CHECKED AGAINST THE SHARED SCHEMAS.
//
// NP-015 ("Add shared schemas for account, consent, plan, billing, push,
// widget and deletion routes") landed the schemas in
// shared/api-client/src/schemas/{account,auth,consent,entitlements,billing,
// notifications,widgets,deletion}.ts. Nothing checked them against the routes:
// shared/api-client/tests/accountSchemas.test.ts parses hand-written fixtures,
// which agree with the schema by construction.
//
// This file calls every one of those routes for real — the exported handler, a
// signed token, the loopback test database — and parses what comes back with
// the schema the native app reads it through. Read _contract.ts first: it
// explains why the schemas are imported by RELATIVE path, why "it parses" is
// not enough, and how the domain tickets (NP-018 … NP-024, NP-037, NP-202) add
// their own routes.
//
// THE ROUTE LIST IS THE MANIFEST BELOW, and the last test in this file fails if
// any entry in it was never actually called.
//
// The two fixture members are FRESH members: no programs, no logs, no saved
// programs. Each domain ticket seeds what its own routes need.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// The routes. Every one of these is a real exported handler.
import { GET as authMeGET } from '../../../app/api/auth/me/route'
import { GET as profileGET, PATCH as profilePATCH } from '../../../app/api/profile/route'
import { GET as consentGET, POST as consentPOST } from '../../../app/api/me/consent/route'
import {
  GET as aiConsentGET,
  POST as aiConsentPOST,
  DELETE as aiConsentDELETE,
} from '../../../app/api/me/ai-consent/route'
import { GET as entitlementsGET } from '../../../app/api/me/entitlements/route'
import { GET as billingStatusGET } from '../../../app/api/billing/status/route'
import { POST as checkoutPOST } from '../../../app/api/billing/checkout/route'
import { POST as portalPOST } from '../../../app/api/billing/portal/route'
import {
  GET as preferencesGET,
  PATCH as preferencesPATCH,
} from '../../../app/api/notifications/preferences/route'
import { POST as subscribePOST } from '../../../app/api/notifications/subscribe/route'
import { POST as unsubscribePOST } from '../../../app/api/notifications/unsubscribe/route'
import { GET as widgetsGET } from '../../../app/api/widgets/summary/route'
// /api/tutorial-progress is loaded through the harness — see
// loadTutorialProgressRoute() for the exports-map reason it cannot be imported.
import { POST as feedbackPOST } from '../../../app/api/feedback/route'
import {
  GET as accountGET,
  DELETE as accountDELETE,
  POST as accountPOST,
} from '../../../app/api/me/account/route'
import { POST as restorePOST } from '../../../app/api/me/account/restore/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import { MeResponseSchema } from '../../../../shared/api-client/src/schemas/auth'
import {
  ProfileResponseSchema,
  TutorialProgressStateSchema,
  TutorialProgressEntrySchema,
  FeedbackResponseSchema,
} from '../../../../shared/api-client/src/schemas/account'
import {
  ConsentStatusSchema,
  AiConsentStatusSchema,
} from '../../../../shared/api-client/src/schemas/consent'
import {
  FEATURES,
  EntitlementsResponseSchema,
} from '../../../../shared/api-client/src/schemas/entitlements'
import {
  BillingStatusResponseSchema,
  BillingRefusalSchema,
  isBillingRefusalCode,
} from '../../../../shared/api-client/src/schemas/billing'
import {
  NOTIFICATION_PREFERENCE_KEYS,
  NotificationPreferencesResponseSchema,
  NotificationsMutationResponseSchema,
} from '../../../../shared/api-client/src/schemas/notifications'
import { WidgetFeedSchema } from '../../../../shared/api-client/src/schemas/widgets'
import {
  DELETE_CONFIRMATION,
  AccountStatusResponseSchema,
  DeleteAccountResponseSchema,
  DeleteAccountRefusalSchema,
  CancelDeletionResponseSchema,
  RestoreAccountResponseSchema,
} from '../../../../shared/api-client/src/schemas/deletion'

// Fixtures + the assertion.
import {
  FREE_MEMBER,
  PLUS_MEMBER,
  Coverage,
  assertContract,
  assertEveryRouteCovered,
  dropMembers,
  getJson,
  loadTutorialProgressRoute,
  seedMembers,
  sendJson,
  type ContractRoute,
} from './_contract'

import User from '../../../models/User'
import PushSubscription from '../../../models/PushSubscription'
import TutorialProgress from '../../../models/TutorialProgress'
import Feedback from '../../../models/Feedback'
import { restoreToken } from '../../../lib/accountRestoreToken'

// ---------------------------------------------------------------------------
// The manifest: every route NP-015's schemas describe.
//
// Sources for the list: the schema headers in
// shared/api-client/src/schemas/{account,auth,consent,entitlements,billing,
// notifications,widgets,deletion}.ts, the header of
// shared/api-client/tests/accountSchemas.test.ts, and
// expo/gap_analysis/PARITY_GAP_ANALYSIS.md §6 ("Consent, entitlements,
// billing, notifications, widgets, deletion, tutorial, feedback").
// ---------------------------------------------------------------------------

const NP015_ROUTES: readonly ContractRoute[] = [
  // account + auth
  { method: 'GET', path: '/api/auth/me', schema: 'MeResponseSchema' },
  { method: 'GET', path: '/api/profile', schema: 'ProfileResponseSchema' },
  { method: 'PATCH', path: '/api/profile', schema: 'ProfileResponseSchema', note: 'the allow-list, key for key' },
  { method: 'GET', path: '/api/tutorial-progress', schema: 'TutorialProgressStateSchema', note: '204 with no body until something is stored' },
  { method: 'PUT', path: '/api/tutorial-progress', schema: '(204, no body)' },
  { method: 'POST', path: '/api/feedback', schema: 'FeedbackResponseSchema' },
  // consent — two records, two versions
  { method: 'GET', path: '/api/me/consent', schema: 'ConsentStatusSchema' },
  { method: 'POST', path: '/api/me/consent', schema: 'ConsentStatusSchema' },
  { method: 'GET', path: '/api/me/ai-consent', schema: 'AiConsentStatusSchema' },
  { method: 'POST', path: '/api/me/ai-consent', schema: 'AiConsentStatusSchema' },
  { method: 'DELETE', path: '/api/me/ai-consent', schema: 'AiConsentStatusSchema' },
  // entitlements
  { method: 'GET', path: '/api/me/entitlements', schema: 'EntitlementsResponseSchema' },
  // billing
  { method: 'GET', path: '/api/billing/status', schema: 'BillingStatusResponseSchema' },
  { method: 'POST', path: '/api/billing/checkout', schema: 'BillingRefusalSchema', note: '503 billing_not_configured — the state the app ships in' },
  { method: 'POST', path: '/api/billing/portal', schema: 'BillingRefusalSchema', note: 'same' },
  // notifications
  { method: 'GET', path: '/api/notifications/preferences', schema: 'NotificationPreferencesResponseSchema' },
  { method: 'PATCH', path: '/api/notifications/preferences', schema: 'NotificationsMutationResponseSchema' },
  { method: 'POST', path: '/api/notifications/subscribe', schema: 'NotificationsMutationResponseSchema', note: 'a native Expo token, not a web endpoint' },
  { method: 'POST', path: '/api/notifications/unsubscribe', schema: 'NotificationsMutationResponseSchema' },
  // widgets
  { method: 'GET', path: '/api/widgets/summary', schema: 'WidgetFeedSchema' },
  // deletion — the App Store 5.1.1(v) path
  { method: 'GET', path: '/api/me/account', schema: 'AccountStatusResponseSchema' },
  { method: 'DELETE', path: '/api/me/account', schema: 'DeleteAccountResponseSchema' },
  { method: 'POST', path: '/api/me/account', schema: 'CancelDeletionResponseSchema' },
  { method: 'POST', path: '/api/me/account/restore', schema: 'RestoreAccountResponseSchema', note: 'unauthenticated: the MAC is the credential' },
]

// What is deliberately NOT here, so the list above can be read as complete:
//
//   POST /api/billing/webhook — Stripe to server. It has no client contract
//     and no schema in shared/api-client; lib/billing is tested by
//     tests/unit/billing/*.
//   POST /api/auth/{send-link,check-session,verify-link} — the magic-link
//     flow. Those schemas are the May-era half of schemas/auth.ts, not NP-015's
//     (which re-aligned the `user` projection GET /api/auth/me answers with),
//     and the routes are driven by tests/unit/auth/*.
//   Everything else in shared/api-client — programs, workouts, schedule,
//     exercises, streaks, mood, weight, nutrition, Mind, chat. Those schemas
//     still describe the May API; re-aligning them and adding their routes here
//     is NP-018 … NP-024, NP-037 and NP-202, one file each.

const coverage = new Coverage()

/** Every dotted path a client reads out of one feature's entitlement block. */
const FEATURE_KEYS = [
  'allowed',
  'canCreate',
  'requiresTier',
  'limit',
  'used',
  'remaining',
  'resetsAt',
  'window',
]

const PUSH_ENDPOINT = 'ExponentPushToken[np015-contract-test]'

before(async () => {
  await seedMembers()
  await PushSubscription.deleteMany({ endpoint: PUSH_ENDPOINT })
  await TutorialProgress.deleteMany({ userId: { $in: [FREE_MEMBER.id, PLUS_MEMBER.id] } })
  await Feedback.deleteMany({ userId: { $in: [FREE_MEMBER.id, PLUS_MEMBER.id] } })
})

after(async () => {
  await PushSubscription.deleteMany({ endpoint: PUSH_ENDPOINT })
  await TutorialProgress.deleteMany({ userId: { $in: [FREE_MEMBER.id, PLUS_MEMBER.id] } })
  await Feedback.deleteMany({ userId: { $in: [FREE_MEMBER.id, PLUS_MEMBER.id] } })
  await dropMembers()
  await mongoose.disconnect()
})

// ═══════════════════════════════════════════════════════════════════════════
// Entitlements — the one every gate and every upsell reads
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/me/entitlements matches EntitlementsResponseSchema for a free member and for a Plus member', async () => {
  const expectKeys = [
    'role',
    'tier',
    'enforced',
    'grandfathered',
    'subscription',
    'checkoutAvailable',
    'features',
    ...FEATURES.flatMap((feature) => FEATURE_KEYS.map((key) => `features.${feature}.${key}`)),
  ]

  for (const member of [FREE_MEMBER, PLUS_MEMBER]) {
    // `tz` is minutes WEST of UTC (lib/dayWindow.ts), never an IANA zone: the
    // allowance windows in this response are the caller's local day.
    const { status, body } = await getJson(entitlementsGET, '/api/me/entitlements', member, {
      tz: '240',
    })
    coverage.mark('GET', '/api/me/entitlements')

    assert.equal(status, 200)
    assertContract({
      label: `GET /api/me/entitlements (${member.label})`,
      schema: EntitlementsResponseSchema,
      body,
      expectKeys,
    })

    const parsed = EntitlementsResponseSchema.parse(body)
    assert.equal(parsed.tier, member.label)
    assert.equal(parsed.enforced, true, 'the fixture switches enforcement on')
    // Every feature the schema names must be answered for — a feature the
    // server stops reporting is a screen the native app cannot gate.
    for (const feature of FEATURES) {
      assert.ok(parsed.features[feature], `no entitlement reported for '${feature}'`)
    }
    // And the free/Plus difference the schema describes has to be real.
    // `vision` is the one feature with a free allowance of 0, so it is the one
    // whose `allowed` differs by tier rather than only its remaining count.
    assert.equal(
      parsed.features.vision?.allowed,
      member.label === 'plus',
      'vision is Plus-only (free limit 0); `allowed` must differ between the tiers',
    )
    // `limit`/`remaining` are null when access is UNCAPPED, which is NOT the
    // same as a limit of zero — a client that treated null as 0 would lock a
    // paying member out of everything.
    assert.equal(
      parsed.features.vision?.limit,
      member.label === 'plus' ? null : 0,
      'uncapped must be null, and a zero allowance must be 0',
    )
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Account, profile, consent
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/auth/me matches MeResponseSchema', async () => {
  for (const member of [FREE_MEMBER, PLUS_MEMBER]) {
    const { status, body } = await getJson(authMeGET, '/api/auth/me', member)
    coverage.mark('GET', '/api/auth/me')

    assert.equal(status, 200)
    assertContract({
      label: `GET /api/auth/me (${member.label})`,
      schema: MeResponseSchema,
      body,
      expectKeys: [
        'user._id',
        'user.email',
        'user.name',
        'user.role',
        'user.tier',
        'user.grandfathered',
        'user.savedPrograms',
        'user.profile',
        'user.onboardingCompleted',
        'user.createdAt',
        'user.updatedAt',
        // The sliding session: a fresh token rides on the body so a native
        // client can replace the one it stored.
        'token',
      ],
    })
  }

  // The Plus member's projected subscription block — three fields, no more.
  const { body } = await getJson(authMeGET, '/api/auth/me', PLUS_MEMBER)
  assertContract({
    label: 'GET /api/auth/me (plus, subscription projection)',
    schema: MeResponseSchema,
    body,
    expectKeys: [
      'user.subscription.status',
      'user.subscription.currentPeriodEnd',
      'user.subscription.cancelAtPeriodEnd',
    ],
  })
})

test('GET /api/profile and PATCH /api/profile match ProfileResponseSchema', async () => {
  const read = await getJson(profileGET, '/api/profile', PLUS_MEMBER)
  coverage.mark('GET', '/api/profile')
  assert.equal(read.status, 200)
  assertContract({
    label: 'GET /api/profile',
    schema: ProfileResponseSchema,
    body: read.body,
    expectKeys: [
      'profile',
      'profile.fitnessGoal',
      'onboardingCompleted',
      'name',
      'email',
      'profileIcon',
      'avatarUrl',
      'createdAt',
    ],
  })

  // The write side, over the server's allow-list. Every key here is one the
  // server actually stores — a native onboarding that sends anything else is
  // silently dropped, which is the bug NP-015's profile schema exists to stop.
  const written = await sendJson(profilePATCH, 'PATCH', '/api/profile', PLUS_MEMBER, {
    profile: {
      fitnessGoal: 'gain_muscle',
      fitnessGoals: ['gain_muscle'],
      nutritionDirection: 'gain',
      experienceLevel: 'intermediate',
      age: 34,
      biologicalSex: 'male',
      heightCm: 180,
      currentWeightKg: 82,
      targetWeightKg: 86,
      equipmentAccess: ['full_gym'],
      injuryNotes: 'none',
      weeklyAvailability: 4,
      weightUnit: 'kg',
      planPromoteMode: 'manual',
    },
    onboardingCompleted: true,
    name: 'Contract Plus',
  })
  coverage.mark('PATCH', '/api/profile')

  assert.equal(written.status, 200)
  assertContract({
    label: 'PATCH /api/profile',
    schema: ProfileResponseSchema,
    body: written.body,
    // No `createdAt` here: PATCH's projection carries it but its response body
    // does not, which is why the schema has it nullish.
    expectKeys: ['profile', 'onboardingCompleted', 'name', 'email', 'profileIcon', 'avatarUrl'],
  })

  // Every key the schema declares for the profile survived the round trip —
  // this is the allow-list check, not a shape check.
  const parsed = ProfileResponseSchema.parse(written.body)
  const stored = (parsed.profile ?? {}) as Record<string, unknown>
  for (const key of [
    'fitnessGoal', 'fitnessGoals', 'nutritionDirection', 'experienceLevel', 'age',
    'biologicalSex', 'heightCm', 'currentWeightKg', 'targetWeightKg', 'equipmentAccess',
    'injuryNotes', 'weeklyAvailability', 'weightUnit', 'planPromoteMode',
  ]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(stored, key),
      `PATCH /api/profile dropped '${key}', which shared/api-client says it stores`,
    )
  }
})

test('GET | POST /api/me/consent match ConsentStatusSchema, with the AI decision nested', async () => {
  const before_ = await getJson(consentGET, '/api/me/consent', FREE_MEMBER)
  coverage.mark('GET', '/api/me/consent')
  assert.equal(before_.status, 200)
  assertContract({
    label: 'GET /api/me/consent (never agreed)',
    schema: ConsentStatusSchema,
    body: before_.body,
    expectKeys: [
      'termsVersion',
      'minimumAge',
      'current',
      'acceptedVersion',
      'acceptedAt',
      'ai',
      'ai.version',
      'ai.provider',
      'ai.granted',
      'ai.decided',
    ],
  })

  const recorded = await sendJson(consentPOST, 'POST', '/api/me/consent', FREE_MEMBER, {
    accepted: true,
    ai: true,
  })
  coverage.mark('POST', '/api/me/consent')
  assert.equal(recorded.status, 200)
  assertContract({
    label: 'POST /api/me/consent',
    schema: ConsentStatusSchema,
    body: recorded.body,
    expectKeys: ['termsVersion', 'current', 'acceptedVersion', 'acceptedAt', 'ai', 'ai.granted', 'ai.decided'],
  })
  const parsed = ConsentStatusSchema.parse(recorded.body)
  assert.equal(parsed.current, true, 'the tick did not take')
  assert.equal(parsed.ai?.granted, true, 'the separate AI tick did not take')
})

test('GET | POST | DELETE /api/me/ai-consent match AiConsentStatusSchema', async () => {
  const expectKeys = ['version', 'provider', 'granted', 'decided']

  const read = await getJson(aiConsentGET, '/api/me/ai-consent', PLUS_MEMBER)
  coverage.mark('GET', '/api/me/ai-consent')
  assert.equal(read.status, 200)
  assertContract({ label: 'GET /api/me/ai-consent', schema: AiConsentStatusSchema, body: read.body, expectKeys })

  const granted = await sendJson(aiConsentPOST, 'POST', '/api/me/ai-consent', PLUS_MEMBER, {
    accepted: true,
    source: 'settings',
  })
  coverage.mark('POST', '/api/me/ai-consent')
  assert.equal(granted.status, 200)
  assertContract({
    label: 'POST /api/me/ai-consent',
    schema: AiConsentStatusSchema,
    body: granted.body,
    expectKeys: [...expectKeys, 'decidedAt', 'decidedVersion'],
  })
  assert.equal(AiConsentStatusSchema.parse(granted.body).granted, true)

  // Withdrawal is a DELETE, never `accepted: false` — and it is the only path
  // that sets `revokedAt`, which is why the native settings screen reads it.
  const revoked = await sendJson(aiConsentDELETE, 'DELETE', '/api/me/ai-consent', PLUS_MEMBER, {})
  coverage.mark('DELETE', '/api/me/ai-consent')
  assert.equal(revoked.status, 200)
  assertContract({
    label: 'DELETE /api/me/ai-consent',
    schema: AiConsentStatusSchema,
    body: revoked.body,
    expectKeys: [...expectKeys, 'revokedAt'],
  })
  assert.equal(AiConsentStatusSchema.parse(revoked.body).granted, false)
})

// ═══════════════════════════════════════════════════════════════════════════
// Billing — unconfigured, which is the state the app ships in
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/billing/status matches BillingStatusResponseSchema', async () => {
  for (const member of [FREE_MEMBER, PLUS_MEMBER]) {
    const { status, body } = await getJson(billingStatusGET, '/api/billing/status', member)
    coverage.mark('GET', '/api/billing/status')
    assert.equal(status, 200, 'this route is always 200 when authenticated, even unconfigured')
    assertContract({
      label: `GET /api/billing/status (${member.label})`,
      schema: BillingStatusResponseSchema,
      body,
      expectKeys: [
        'configured',
        'mode',
        'tier',
        'role',
        'plans',
        'plans.monthly',
        'plans.annual',
        'subscription',
        'subscription.status',
        'subscription.plan',
        'subscription.currentPeriodEnd',
        'subscription.cancelAtPeriodEnd',
        'subscription.grandfathered',
        'subscription.managed',
      ],
    })
  }
})

test('POST /api/billing/checkout and POST /api/billing/portal refuse with BillingRefusalSchema when billing is off', async () => {
  const checkout = await sendJson(checkoutPOST, 'POST', '/api/billing/checkout', FREE_MEMBER, {
    plan: 'monthly',
  })
  coverage.mark('POST', '/api/billing/checkout')
  assert.equal(checkout.status, 503)
  assertContract({
    label: 'POST /api/billing/checkout (unconfigured)',
    schema: BillingRefusalSchema,
    body: checkout.body,
    expectKeys: ['error'],
  })
  const checkoutError = BillingRefusalSchema.parse(checkout.body).error
  assert.equal(checkoutError, 'billing_not_configured')
  assert.ok(
    isBillingRefusalCode(checkoutError),
    'the refusal code must be one shared/api-client knows, or no client has a branch for it',
  )

  const portal = await sendJson(portalPOST, 'POST', '/api/billing/portal', PLUS_MEMBER, {})
  coverage.mark('POST', '/api/billing/portal')
  assert.equal(portal.status, 503)
  assertContract({
    label: 'POST /api/billing/portal (unconfigured)',
    schema: BillingRefusalSchema,
    body: portal.body,
    expectKeys: ['error'],
  })
  assert.ok(isBillingRefusalCode(BillingRefusalSchema.parse(portal.body).error))
})

// ═══════════════════════════════════════════════════════════════════════════
// Notifications
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/notifications/preferences reports every switch NOTIFICATION_PREFERENCE_KEYS names', async () => {
  const { status, body } = await getJson(preferencesGET, '/api/notifications/preferences', FREE_MEMBER)
  coverage.mark('GET', '/api/notifications/preferences')
  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/notifications/preferences',
    schema: NotificationPreferencesResponseSchema,
    body,
    expectKeys: [
      'preferences',
      'notificationsEnabled',
      'emailEngagement',
      ...NOTIFICATION_PREFERENCE_KEYS.map((key) => `preferences.${key}`),
    ],
  })

  // dailyGlance is the one that defaults OFF; the rest default ON. A client
  // that rendered the wrong default would show a member a switch that lies.
  const parsed = NotificationPreferencesResponseSchema.parse(body)
  assert.equal(parsed.preferences.dailyGlance, false)
  assert.equal(parsed.preferences.workoutReminder, true)
})

test('PATCH /api/notifications/preferences, POST subscribe and POST unsubscribe answer NotificationsMutationResponseSchema', async () => {
  const patched = await sendJson(
    preferencesPATCH,
    'PATCH',
    '/api/notifications/preferences',
    FREE_MEMBER,
    // FLAT, not nested under `preferences` — the shape of the request matters
    // as much as the response: a nested body is a 400.
    { dailyGlance: true, emailEngagement: false },
  )
  coverage.mark('PATCH', '/api/notifications/preferences')
  assert.equal(patched.status, 200)
  assertContract({
    label: 'PATCH /api/notifications/preferences',
    schema: NotificationsMutationResponseSchema,
    body: patched.body,
    expectKeys: ['success'],
  })

  // A NATIVE registration: `endpoint` carries an Expo push token and there are
  // no web-push keys. `reenable` is the only thing allowed to flip the master
  // switch back on.
  const subscribed = await sendJson(subscribePOST, 'POST', '/api/notifications/subscribe', FREE_MEMBER, {
    endpoint: PUSH_ENDPOINT,
    platform: 'ios',
    reenable: true,
  })
  coverage.mark('POST', '/api/notifications/subscribe')
  assert.equal(subscribed.status, 200)
  assertContract({
    label: 'POST /api/notifications/subscribe (native token)',
    schema: NotificationsMutationResponseSchema,
    body: subscribed.body,
    expectKeys: ['success'],
  })
  assert.ok(
    await PushSubscription.findOne({ endpoint: PUSH_ENDPOINT }),
    'the native token was accepted but not stored',
  )

  const unsubscribed = await sendJson(
    unsubscribePOST,
    'POST',
    '/api/notifications/unsubscribe',
    FREE_MEMBER,
    { endpoint: PUSH_ENDPOINT },
  )
  coverage.mark('POST', '/api/notifications/unsubscribe')
  assert.equal(unsubscribed.status, 200)
  assertContract({
    label: 'POST /api/notifications/unsubscribe',
    schema: NotificationsMutationResponseSchema,
    body: unsubscribed.body,
    expectKeys: ['success'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Widgets
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/widgets/summary matches WidgetFeedSchema, every widget drawn server-side', async () => {
  const { status, body } = await getJson(widgetsGET, '/api/widgets/summary', FREE_MEMBER, { tz: '240' })
  coverage.mark('GET', '/api/widgets/summary')
  assert.equal(status, 200)

  assertContract({
    label: 'GET /api/widgets/summary',
    schema: WidgetFeedSchema,
    body,
    expectKeys: ['generatedAt', 'todayKey', 'refreshAfterSeconds', 'widgets', 'badgeCount'],
  })

  // A widget is drawn by the OS with no JS: the wording must already be in the
  // response, for every widget in the gallery.
  const feed = WidgetFeedSchema.parse(body)
  assert.ok(feed.widgets.length > 0, 'no widgets in the feed')
  for (const widget of feed.widgets) {
    for (const key of ['key', 'title', 'headline', 'caption', 'state', 'rings', 'deepLink']) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(widget, key),
        `widget '${widget.key}' is missing '${key}', which shared/api-client says it carries`,
      )
    }
    assert.equal(typeof widget.headline, 'string', 'the big number is a STRING on the wire')
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Tutorial progress + feedback — account-scoped, same screens
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/tutorial-progress is a bodyless 204 until PUT stores a state, then matches TutorialProgressStateSchema', async () => {
  const { GET: tutorialGET, PUT: tutorialPUT } = loadTutorialProgressRoute()

  const empty = await getJson(tutorialGET, '/api/tutorial-progress', FREE_MEMBER)
  coverage.mark('GET', '/api/tutorial-progress')
  assert.equal(empty.status, 204, 'nothing stored yet: 204, and no JSON to parse')
  assert.equal(empty.body, null)

  // The blob's shape is owned by @redbtn/redtutorial; the route round-trips
  // whatever parseProgressState accepts. Only the ENTRY is described by
  // shared/api-client, so that is what is asserted.
  const state = {
    enabled: true,
    tutorials: {
      'become-onboarding': { status: 'completed', version: 1, segments: { home: 'completed' } },
    },
  }
  const stored = await sendJson(tutorialPUT, 'PUT', '/api/tutorial-progress', FREE_MEMBER, state)
  coverage.mark('PUT', '/api/tutorial-progress')
  assert.equal(stored.status, 204, 'PUT answers 204 with no body')

  const read = await getJson(tutorialGET, '/api/tutorial-progress', FREE_MEMBER)
  assert.equal(read.status, 200)
  assertContract({
    label: 'GET /api/tutorial-progress',
    schema: TutorialProgressStateSchema,
    body: read.body,
    expectKeys: ['enabled', 'tutorials'],
  })
  const entry = (read.body as { tutorials: Record<string, unknown> }).tutorials['become-onboarding']
  assertContract({
    label: 'GET /api/tutorial-progress (one entry)',
    schema: TutorialProgressEntrySchema,
    body: entry,
    expectKeys: ['status', 'version', 'segments'],
  })
})

test('POST /api/feedback matches FeedbackResponseSchema', async () => {
  const { status, body } = await sendJson(feedbackPOST, 'POST', '/api/feedback', FREE_MEMBER, {
    type: 'bug',
    message: 'The contract harness says hello.',
    metadata: { surface: 'contract-test' },
  })
  coverage.mark('POST', '/api/feedback')
  assert.equal(status, 200)
  assertContract({
    label: 'POST /api/feedback',
    schema: FeedbackResponseSchema,
    body,
    expectKeys: ['success', 'id'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Deletion — LAST, because DELETE stamps the free member's row and drops its
// push registrations. The App Store 5.1.1(v) path, end to end.
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/me/account matches AccountStatusResponseSchema, and serves the wording', async () => {
  const { status, body } = await getJson(accountGET, '/api/me/account', FREE_MEMBER)
  coverage.mark('GET', '/api/me/account')
  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/me/account (nothing pending)',
    schema: AccountStatusResponseSchema,
    body,
    expectKeys: [
      'email',
      'deletion',
      'deletion.pending',
      'deletion.requestedAt',
      'deletion.restorableUntil',
      'deletion.daysLeft',
      'deletion.restoreWindowDays',
      'covers',
      'exceptions',
      'confirmation',
    ],
  })

  const parsed = AccountStatusResponseSchema.parse(body)
  assert.equal(parsed.deletion.pending, false)
  // The phrase is READ from the server rather than hardcoded in each client;
  // DELETE_CONFIRMATION in shared/api-client must be the same phrase or every
  // native deletion 400s.
  assert.equal(parsed.confirmation, DELETE_CONFIRMATION)
  assert.ok(parsed.covers.length > 0 && parsed.exceptions.length > 0)
})

test('DELETE /api/me/account schedules it, POST /api/me/account/restore undoes it from the emailed MAC', async () => {
  // The refusal first: a DELETE that fires on an empty body is one mis-wired
  // client away from deleting somebody's account.
  const refused = await sendJson(accountDELETE, 'DELETE', '/api/me/account', FREE_MEMBER, {})
  assert.equal(refused.status, 400)
  assertContract({
    label: 'DELETE /api/me/account (no confirmation)',
    schema: DeleteAccountRefusalSchema,
    body: refused.body,
    expectKeys: ['error', 'confirmation'],
  })

  const requested = await sendJson(accountDELETE, 'DELETE', '/api/me/account', FREE_MEMBER, {
    confirm: DELETE_CONFIRMATION,
    source: 'ios',
  })
  coverage.mark('DELETE', '/api/me/account')
  assert.equal(requested.status, 200)
  assertContract({
    label: 'DELETE /api/me/account',
    schema: DeleteAccountResponseSchema,
    body: requested.body,
    expectKeys: [
      'ok',
      'emailed',
      'pushSubscriptionsDropped',
      'deletion',
      'deletion.pending',
      'deletion.requestedAt',
      'deletion.restorableUntil',
      'deletion.daysLeft',
      'deletion.restoreWindowDays',
    ],
  })
  assert.equal(DeleteAccountResponseSchema.parse(requested.body).deletion.pending, true)

  // The restore link's credential is an HMAC over the exact `requestedAt` of
  // the request being undone — no session, because the request signed every
  // device out. Minted here the way lib/email does it.
  const row = await User.findById(FREE_MEMBER.id).select('deletion').lean<{
    deletion?: { requestedAt?: Date }
  } | null>()
  const requestedAt = row?.deletion?.requestedAt
  assert.ok(requestedAt, 'the deletion was not stamped on the row')

  const restored = await sendJson(restorePOST, 'POST', '/api/me/account/restore', null, {
    u: FREE_MEMBER.id,
    t: restoreToken(FREE_MEMBER.id, requestedAt, process.env.JWT_SECRET ?? ''),
  })
  coverage.mark('POST', '/api/me/account/restore')
  assert.equal(restored.status, 200)
  assertContract({
    label: 'POST /api/me/account/restore',
    schema: RestoreAccountResponseSchema,
    body: restored.body,
    expectKeys: ['ok', 'deletion', 'deletion.pending'],
  })
  assert.equal(RestoreAccountResponseSchema.parse(restored.body).ok, true)

  // And the one refusal for every failure mode, which a client must be able to
  // read even though it must not be able to tell the modes apart.
  const forged = await sendJson(restorePOST, 'POST', '/api/me/account/restore', null, {
    u: FREE_MEMBER.id,
    t: 'f'.repeat(32),
  })
  assert.equal(forged.status, 400)
  assertContract({
    label: 'POST /api/me/account/restore (forged MAC)',
    schema: RestoreAccountResponseSchema,
    body: forged.body,
    expectKeys: ['ok', 'error'],
  })
})

test('POST /api/me/account { cancel: true } matches CancelDeletionResponseSchema', async () => {
  await sendJson(accountDELETE, 'DELETE', '/api/me/account', FREE_MEMBER, {
    confirm: DELETE_CONFIRMATION,
    source: 'android',
  })

  const cancelled = await sendJson(accountPOST, 'POST', '/api/me/account', FREE_MEMBER, {
    cancel: true,
  })
  coverage.mark('POST', '/api/me/account')
  assert.equal(cancelled.status, 200)
  assertContract({
    label: 'POST /api/me/account (cancel)',
    schema: CancelDeletionResponseSchema,
    body: cancelled.body,
    expectKeys: ['ok', 'deletion', 'deletion.pending', 'deletion.restoreWindowDays'],
  })
  assert.equal(CancelDeletionResponseSchema.parse(cancelled.body).deletion?.pending, false)
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-015 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP015_ROUTES, coverage)
  // And the manifest is not allowed to shrink quietly: 24 routes, the list
  // above. A domain ticket adds its own file and its own manifest.
  assert.equal(NP015_ROUTES.length, 24)
  assert.equal(coverage.list().length, 24)
})
