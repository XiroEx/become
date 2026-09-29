// Run with: npx tsx --test tests/accountSchemas.test.ts
//
// The account area's wire contract: profile, consent, entitlements, billing,
// notifications, widgets, deletion — plus tutorial progress and feedback,
// which are account-scoped routes the same screens call.
//
// Every body below is a REAL one, built by reading the route that serves it
// (the file is named in each test). The widget feed is literally the output of
// webapp/lib/widgets/feed.ts → buildWidgetFeed, pasted in.
//
// The last test in this file is the one that matters most for a shipped app:
// every response schema must survive a field it has never heard of, because a
// store build outlives the server it was written against.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  // account
  UserProfileSchema,
  ProfileResponseSchema,
  ProfileUpdateRequestSchema,
  AgeBelowMinimumErrorSchema,
  TutorialProgressEntrySchema,
  TutorialProgressStateSchema,
  FeedbackRequestSchema,
  FeedbackResponseSchema,
  // auth (GET /api/auth/me)
  MeResponseSchema,
  // consent
  ConsentStatusSchema,
  AiConsentStatusSchema,
  ConsentAcceptRequestSchema,
  AiConsentRequestSchema,
  AiConsentRefusalSchema,
  // entitlements
  FEATURES,
  FeatureSchema,
  EntitlementsResponseSchema,
  // billing
  BillingStatusResponseSchema,
  CheckoutRequestSchema,
  CheckoutResponseSchema,
  PortalRequestSchema,
  PortalResponseSchema,
  BILLING_REFUSAL_CODES,
  BillingRefusalSchema,
  isBillingRefusalCode,
  // notifications
  NOTIFICATION_PREFERENCE_KEYS,
  NotificationPreferencesResponseSchema,
  NotificationPreferencesUpdateRequestSchema,
  PushSubscribeRequestSchema,
  PushUnsubscribeRequestSchema,
  NotificationsMutationResponseSchema,
  // widgets
  WidgetFeedSchema,
  // deletion
  DELETE_CONFIRMATION,
  AccountStatusResponseSchema,
  DeleteAccountRequestSchema,
  DeleteAccountResponseSchema,
  DeleteAccountRefusalSchema,
  CancelDeletionRequestSchema,
  CancelDeletionResponseSchema,
  RestoreAccountRequestSchema,
  RestoreAccountResponseSchema,
} from '../src/index';

// ---------------------------------------------------------------------------
// Real response bodies, one per route.
// ---------------------------------------------------------------------------

/** GET /api/auth/me — webapp/app/api/auth/me/route.ts. */
const ME_BODY = {
  user: {
    _id: '68f1c2a9b4d3e10012ab34cd',
    email: 'jon@example.com',
    name: 'Jon',
    role: 'user',
    tier: 'plus',
    grandfathered: true,
    subscription: {
      status: 'active',
      currentPeriodEnd: '2026-10-14T08:15:00.000Z',
      cancelAtPeriodEnd: false,
    },
    savedPrograms: [],
    profile: {
      fitnessGoal: 'gain_muscle',
      fitnessGoals: ['gain_muscle', 'improve_performance'],
      experienceLevel: 'intermediate',
      age: 34,
      biologicalSex: 'male',
      heightCm: 181,
      currentWeightKg: 84.2,
      targetWeightKg: 88,
      weightUnit: 'kg',
    },
    onboardingCompleted: true,
    createdAt: '2025-11-02T19:41:12.004Z',
    updatedAt: '2026-09-28T06:12:44.881Z',
  },
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.body.sig',
};

/** GET /api/profile — webapp/app/api/profile/route.ts:25-35. */
const PROFILE_BODY = {
  profile: {
    fitnessGoal: 'lose_weight',
    fitnessGoals: ['lose_weight', 'general_health'],
    nutritionDirection: 'lose',
    experienceLevel: 'beginner',
    age: 29,
    biologicalSex: 'female',
    heightCm: 168,
    currentWeightKg: 71.5,
    targetWeightKg: 64,
    equipmentAccess: ['dumbbells', 'cables'],
    injuryNotes: 'Left knee — no deep lunges',
    weeklyAvailability: 4,
    weightUnit: 'kg',
    planPromoteMode: 'manual',
  },
  onboardingCompleted: true,
  name: 'Nadine',
  email: 'nadine@example.com',
  profileIcon: 'flame',
  avatarUrl: null,
  createdAt: '2026-01-09T11:02:31.117Z',
};

/** GET /api/me/consent — webapp/lib/consent.ts consentStatus() + the nested
 *  aiConsentStatus() from webapp/lib/aiConsent.ts. */
const CONSENT_BODY = {
  termsVersion: '1.1.0',
  minimumAge: 13,
  current: true,
  acceptedVersion: '1.1.0',
  acceptedAt: '2026-03-04T20:11:09.502Z',
  ai: {
    version: '1.0.0',
    provider: 'Google Gemini',
    granted: true,
    decided: true,
    decidedAt: '2026-03-04T20:11:09.502Z',
    revokedAt: null,
    decidedVersion: '1.0.0',
  },
};

/** GET /api/me/ai-consent — the same status, served on its own. */
const AI_CONSENT_BODY = CONSENT_BODY.ai;

/** GET /api/me/entitlements — a free member with enforcement ON. Limits are
 *  FREE_LIMITS from webapp/lib/entitlements.ts. */
const ENTITLEMENTS_BODY = {
  role: 'user',
  tier: 'free',
  enforced: true,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {
    'custom-meals': { allowed: true, canCreate: true, requiresTier: 'plus', limit: 3, used: 1, remaining: 2, resetsAt: null, window: 'lifetime' },
    'custom-exercises': { allowed: true, canCreate: false, requiresTier: 'plus', limit: 3, used: 3, remaining: 0, resetsAt: null, window: 'lifetime' },
    'custom-programs': { allowed: true, canCreate: true, requiresTier: 'plus', limit: 3, used: 0, remaining: 3, resetsAt: null, window: 'lifetime' },
    'custom-foods': { allowed: true, canCreate: true, requiresTier: 'plus', limit: 3, used: 2, remaining: 1, resetsAt: null, window: 'lifetime' },
    'custom-sessions': { allowed: true, canCreate: true, requiresTier: 'plus', limit: 3, used: 0, remaining: 3, resetsAt: null, window: 'lifetime' },
    'workout-generation': { allowed: true, canCreate: true, requiresTier: 'plus', limit: 3, used: 1, remaining: 2, resetsAt: '2026-09-21T00:00:00.000Z', window: 'week' },
    'ai-food-estimate': { allowed: true, canCreate: false, requiresTier: 'plus', limit: 1, used: 1, remaining: 0, resetsAt: '2026-09-17T00:00:00.000Z', window: 'day' },
    'mind-sessions': { allowed: true, canCreate: true, requiresTier: 'plus', limit: 10, used: 4, remaining: 6, resetsAt: null, window: 'lifetime' },
    vision: { allowed: false, canCreate: false, requiresTier: 'plus', limit: 0, used: 0, remaining: 0, resetsAt: null, window: 'lifetime' },
  },
};

/** GET /api/billing/status — webapp/app/api/billing/status/route.ts:101-124. */
const BILLING_STATUS_BODY = {
  configured: true,
  mode: 'test',
  tier: 'plus',
  role: 'user',
  plans: { monthly: true, annual: false },
  subscription: {
    status: 'active',
    plan: 'monthly',
    currentPeriodEnd: '2026-10-14T08:15:00.000Z',
    cancelAtPeriodEnd: false,
    grandfathered: false,
    managed: true,
  },
};

/** POST /api/billing/checkout 200 — route.ts:208. */
const CHECKOUT_BODY = {
  url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3#fidkdWxOYHwnPyd1blpxYHZxWjA0',
  sessionId: 'cs_test_a1b2c3',
  mode: 'test',
};

/** POST /api/billing/portal 200 — route.ts:48. */
const PORTAL_BODY = {
  url: 'https://billing.stripe.com/p/session/test_YWNjdF8xB2c3',
};

/** GET /api/notifications/preferences — the defaults block plus the two
 *  switches that live outside it (route.ts:31-38). */
const NOTIFICATION_PREFERENCES_BODY = {
  preferences: {
    streakAtRisk: true,
    workoutReminder: true,
    mealReminder: false,
    reEngagement: true,
    chatMessage: true,
    mindReminder: true,
    goalNudge: true,
    superStreakAtRisk: true,
    checkInReminder: true,
    dailyGlance: false,
  },
  notificationsEnabled: true,
  emailEngagement: false,
};

/** GET /api/widgets/summary — the literal output of buildWidgetFeed() in
 *  webapp/lib/widgets/feed.ts for a mid-afternoon member. */
const WIDGET_FEED_BODY = {
  generatedAt: 1789570800000,
  todayKey: '2026-09-16',
  refreshAfterSeconds: 900,
  widgets: [
    {
      key: 'streak',
      title: 'Streak',
      headline: '5',
      headlineUnit: 'days',
      caption: '2 days to 7',
      state: 'done',
      progress: 0.7142857142857143,
      rings: [],
      deepLink: '/dashboard/streaks',
    },
    {
      key: 'nutrition',
      title: 'Nutrition',
      headline: '800',
      headlineUnit: 'cal left',
      caption: 'P 90/150g · C 130/200g · F 40/65g',
      state: 'done',
      progress: 0.6,
      rings: [
        { key: 'calories', label: 'Cal', value: 1200, target: 2000, pct: 0.6, unit: 'cal' },
        { key: 'protein', label: 'Protein', value: 90, target: 150, pct: 0.6, unit: 'g' },
        { key: 'carbs', label: 'Carbs', value: 130, target: 200, pct: 0.65, unit: 'g' },
        { key: 'fats', label: 'Fat', value: 40, target: 65, pct: 0.6153846153846154, unit: 'g' },
      ],
      deepLink: '/dashboard/nutrition',
    },
    {
      key: 'mind',
      title: 'Mind',
      headline: 'Ready',
      headlineUnit: null,
      caption: 'Chapter 2 · Momentum · 4/10',
      state: 'todo',
      progress: 0.4,
      rings: [],
      deepLink: '/dashboard/mind',
    },
    {
      key: 'becoming',
      title: 'Becoming',
      headline: 'Week 6',
      headlineUnit: null,
      caption: 'Momentum · 2 of 4 this week',
      state: 'todo',
      progress: 0.5,
      rings: [],
      deepLink: '/dashboard/mind/becoming',
    },
    {
      key: 'training',
      title: 'Training',
      headline: 'Upper Body Strength',
      headlineUnit: null,
      caption: 'Tap to start',
      state: 'todo',
      progress: 0,
      rings: [],
      deepLink: '/dashboard/workout',
    },
  ],
  badgeCount: 2,
};

/** GET /api/me/account — webapp/app/api/me/account/route.ts:68-74. */
const ACCOUNT_STATUS_BODY = {
  email: 'jon@example.com',
  deletion: {
    pending: true,
    requestedAt: '2026-09-16T09:12:00.000Z',
    restorableUntil: '2026-09-23T09:12:00.000Z',
    daysLeft: 6,
    restoreWindowDays: 7,
  },
  covers: [
    'Your account and sign-in, your profile, body stats and injury notes.',
    'Training logs, schedules, programs you created and your saved programs.',
  ],
  exceptions: ['Records we must keep for tax and accounting.'],
  confirmation: 'DELETE',
};

/** DELETE /api/me/account — route.ts:154-159. */
const DELETE_ACCOUNT_BODY = {
  ok: true,
  emailed: true,
  pushSubscriptionsDropped: 2,
  deletion: ACCOUNT_STATUS_BODY.deletion,
};

/** POST /api/me/account { cancel: true } — route.ts:180. */
const CANCEL_DELETION_BODY = {
  ok: true,
  deletion: {
    pending: false,
    requestedAt: null,
    restorableUntil: null,
    daysLeft: 0,
    restoreWindowDays: 7,
  },
};

/** POST /api/me/account/restore — restore/route.ts:61. */
const RESTORE_BODY = CANCEL_DELETION_BODY;

/** GET /api/tutorial-progress — one entry per tutorial id. */
const TUTORIAL_PROGRESS_BODY = {
  'become-onboarding': {
    status: 'in-progress',
    version: 3,
    segments: { home: 'completed', nutrition: 'dismissed' },
  },
};

/** POST /api/feedback — route.ts:121. */
const FEEDBACK_BODY = { success: true, id: '68f1c2a9b4d3e10012ab34ce' };

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

test('MeResponseSchema: parses a real /api/auth/me body, plan state included', () => {
  const r = MeResponseSchema.safeParse(ME_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.user.tier, 'plus');
  assert.equal(r.data?.user.grandfathered, true);
  assert.equal(r.data?.user.subscription?.status, 'active');
});

// ---------------------------------------------------------------------------
// GET | PATCH /api/profile
// ---------------------------------------------------------------------------

/** The allow-list in webapp/app/api/profile/route.ts:61-76, in its order. */
const ALLOWED_PROFILE_KEYS = [
  'fitnessGoal',
  'fitnessGoals',
  'nutritionDirection',
  'experienceLevel',
  'age',
  'biologicalSex',
  'heightCm',
  'currentWeightKg',
  'targetWeightKg',
  'equipmentAccess',
  'injuryNotes',
  'weeklyAvailability',
  'weightUnit',
  'planPromoteMode',
];

test("UserProfileSchema: declares exactly the server's allow-list", () => {
  assert.deepEqual(Object.keys(UserProfileSchema.shape), ALLOWED_PROFILE_KEYS);
});

test('UserProfileSchema: no longer describes the May profile', () => {
  const keys = Object.keys(UserProfileSchema.shape);
  for (const gone of ['birthYear', 'goal', 'trainingExperience', 'primaryFocus']) {
    assert.equal(keys.includes(gone), false, `${gone} is dropped by the server`);
  }
});

test('UserProfileSchema: every key is optional — a profile may be empty', () => {
  assert.equal(UserProfileSchema.safeParse({}).success, true);
});

test('ProfileResponseSchema: parses a real GET /api/profile body', () => {
  const r = ProfileResponseSchema.safeParse(PROFILE_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.profile?.fitnessGoals?.[0], 'lose_weight');
  assert.equal(r.data?.profileIcon, 'flame');
  assert.equal(r.data?.avatarUrl, null);
  assert.equal(r.data?.createdAt, '2026-01-09T11:02:31.117Z');
});

test('ProfileResponseSchema: parses the PATCH body, which omits createdAt', () => {
  const { createdAt: _dropped, ...patchBody } = PROFILE_BODY;
  void _dropped;
  assert.equal(ProfileResponseSchema.safeParse(patchBody).success, true);
});

test('ProfileResponseSchema: parses a member who has never onboarded', () => {
  const r = ProfileResponseSchema.safeParse({
    profile: {},
    name: null,
    email: 'new@example.com',
    profileIcon: null,
    avatarUrl: null,
    createdAt: null,
  });
  assert.equal(r.success, true);
});

test('ProfileUpdateRequestSchema: accepts the onboarding PATCH', () => {
  const r = ProfileUpdateRequestSchema.safeParse({
    profile: {
      fitnessGoal: 'gain_muscle',
      fitnessGoals: ['gain_muscle'],
      experienceLevel: 'beginner',
      age: 22,
      weightUnit: 'lbs',
    },
    onboardingCompleted: true,
  });
  assert.equal(r.success, true);
});

test('AgeBelowMinimumErrorSchema: parses the age-gate refusal', () => {
  const r = AgeBelowMinimumErrorSchema.safeParse({
    error: 'age_below_minimum',
    minimumAge: 13,
  });
  assert.equal(r.success, true);
  assert.equal(AgeBelowMinimumErrorSchema.safeParse({ error: 'nope' }).success, false);
});

// ---------------------------------------------------------------------------
// /api/me/consent + /api/me/ai-consent
// ---------------------------------------------------------------------------

test('ConsentStatusSchema: parses a real GET /api/me/consent body', () => {
  const r = ConsentStatusSchema.safeParse(CONSENT_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.current, true);
  assert.equal(r.data?.ai?.granted, true);
});

test('ConsentStatusSchema: parses a member who has never agreed', () => {
  const r = ConsentStatusSchema.safeParse({
    termsVersion: '1.1.0',
    minimumAge: 13,
    current: false,
    acceptedVersion: null,
    acceptedAt: null,
    ai: {
      version: '1.0.0',
      provider: 'Google Gemini',
      granted: false,
      decided: false,
      decidedAt: null,
      revokedAt: null,
      decidedVersion: null,
    },
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.ai?.decided, false);
});

test('AiConsentStatusSchema: parses a withdrawal (GET|DELETE /api/me/ai-consent)', () => {
  const r = AiConsentStatusSchema.safeParse({
    ...AI_CONSENT_BODY,
    granted: false,
    revokedAt: '2026-09-15T18:02:44.001Z',
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.granted, false);
  assert.equal(r.data?.revokedAt, '2026-09-15T18:02:44.001Z');
});

test('ConsentAcceptRequestSchema: only a literal true is consent', () => {
  assert.equal(ConsentAcceptRequestSchema.safeParse({ accepted: true, ai: false }).success, true);
  assert.equal(ConsentAcceptRequestSchema.safeParse({ accepted: false }).success, false);
  assert.equal(ConsentAcceptRequestSchema.safeParse({}).success, false);
});

test('AiConsentRequestSchema: false is a legitimate answer, a missing one is not', () => {
  assert.equal(AiConsentRequestSchema.safeParse({ accepted: false, source: 'settings' }).success, true);
  assert.equal(AiConsentRequestSchema.safeParse({ accepted: true, source: 'prompt' }).success, true);
  assert.equal(AiConsentRequestSchema.safeParse({ source: 'settings' }).success, false);
});

test('AiConsentRefusalSchema: parses the 403 an AI route answers with', () => {
  const r = AiConsentRefusalSchema.safeParse({
    error: 'Become needs your permission before sending this to its AI provider.',
    reason: 'ai_consent_required',
    aiConsent: { ...AI_CONSENT_BODY, granted: false, decided: false },
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.aiConsent?.granted, false);
});

// ---------------------------------------------------------------------------
// GET /api/me/entitlements
// ---------------------------------------------------------------------------

test('EntitlementsResponseSchema: parses a real snapshot, all nine features', () => {
  const r = EntitlementsResponseSchema.safeParse(ENTITLEMENTS_BODY);
  assert.equal(r.success, true);
  assert.equal(Object.keys(r.data?.features ?? {}).length, 9);
  assert.equal(r.data?.features['ai-food-estimate']?.canCreate, false);
  assert.equal(r.data?.features['ai-food-estimate']?.resetsAt, '2026-09-17T00:00:00.000Z');
  assert.equal(r.data?.features.vision?.allowed, false);
});

test('FEATURES: the nine gated features the route advertises', () => {
  assert.equal(FEATURES.length, 9);
  for (const feature of FEATURES) {
    assert.equal(FeatureSchema.safeParse(feature).success, true);
    assert.ok(feature in ENTITLEMENTS_BODY.features, `${feature} is missing from the body`);
  }
  assert.equal(FeatureSchema.safeParse('share-programs').success, false);
});

test('EntitlementsResponseSchema: uncapped Plus reports null limits, not zero', () => {
  const r = EntitlementsResponseSchema.safeParse({
    role: 'user',
    tier: 'plus',
    enforced: true,
    grandfathered: true,
    subscription: { status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false },
    checkoutAvailable: false,
    features: {
      vision: { allowed: true, canCreate: true, requiresTier: 'plus', limit: null, used: 0, remaining: null, resetsAt: null, window: 'lifetime' },
    },
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.features.vision?.limit, null);
  assert.equal(r.data?.features.vision?.remaining, null);
});

test('EntitlementsResponseSchema: a tenth feature does not break the snapshot', () => {
  const r = EntitlementsResponseSchema.safeParse({
    ...ENTITLEMENTS_BODY,
    features: {
      ...ENTITLEMENTS_BODY.features,
      'something-new': { allowed: true, canCreate: true, requiresTier: 'plus', limit: null, used: 0, remaining: null, resetsAt: null, window: 'lifetime' },
    },
  });
  assert.equal(r.success, true);
});

// ---------------------------------------------------------------------------
// /api/billing/*
// ---------------------------------------------------------------------------

test('BillingStatusResponseSchema: parses a real status body', () => {
  const r = BillingStatusResponseSchema.safeParse(BILLING_STATUS_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.subscription?.managed, true);
  assert.equal(r.data?.plans?.annual, false);
});

test('BillingStatusResponseSchema: parses the switched-off install', () => {
  const r = BillingStatusResponseSchema.safeParse({
    configured: false,
    mode: 'test',
    tier: 'free',
    role: 'user',
    plans: { monthly: false, annual: false },
    subscription: {
      status: 'none',
      plan: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      grandfathered: false,
      managed: false,
    },
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.configured, false);
});

test('CheckoutRequestSchema: plan is optional, a wrong one is refused', () => {
  assert.equal(CheckoutRequestSchema.safeParse({}).success, true);
  assert.equal(CheckoutRequestSchema.safeParse({ plan: 'annual' }).success, true);
  assert.equal(CheckoutRequestSchema.safeParse({ plan: 'lifetime' }).success, false);
});

test('CheckoutRequestSchema / PortalRequestSchema: returnTo is optional, and only web|app', () => {
  // Absent means 'web' server-side, which is what every browser caller sends:
  // the web flow must be untouched by the native one existing.
  assert.equal(CheckoutRequestSchema.safeParse({ plan: 'monthly' }).success, true);
  assert.equal(CheckoutRequestSchema.safeParse({ plan: 'monthly', returnTo: 'app' }).success, true);
  assert.equal(CheckoutRequestSchema.safeParse({ returnTo: 'web' }).success, true);
  // An unknown target is a 400 'invalid_return_to' on the server, not a silent
  // fall back — returning a native buyer to /dashboard/plan strands them in
  // Safari on a sign-in screen moments after paying.
  assert.equal(CheckoutRequestSchema.safeParse({ returnTo: 'native' }).success, false);

  assert.equal(PortalRequestSchema.safeParse({}).success, true);
  assert.equal(PortalRequestSchema.safeParse({ returnTo: 'app' }).success, true);
  assert.equal(PortalRequestSchema.safeParse({ returnTo: 'App' }).success, false);
});

test('CheckoutResponseSchema / PortalResponseSchema: parse the Stripe links', () => {
  const checkout = CheckoutResponseSchema.safeParse(CHECKOUT_BODY);
  assert.equal(checkout.success, true);
  assert.equal(checkout.data?.sessionId, 'cs_test_a1b2c3');
  assert.equal(PortalResponseSchema.safeParse(PORTAL_BODY).success, true);
  assert.equal(PortalResponseSchema.safeParse({}).success, false);
});

test('BillingRefusalSchema: parses every refusal these routes can answer with', () => {
  assert.equal(BILLING_REFUSAL_CODES.length, 10);
  for (const code of BILLING_REFUSAL_CODES) {
    assert.equal(BillingRefusalSchema.safeParse({ error: code }).success, true);
    assert.equal(isBillingRefusalCode(code), true);
  }
  const dunning = BillingRefusalSchema.safeParse({
    error: 'fix_payment_method',
    status: 'past_due',
    portal: '/api/billing/portal',
  });
  assert.equal(dunning.success, true);
  assert.equal(dunning.data?.portal, '/api/billing/portal');

  const plus = BillingRefusalSchema.safeParse({ error: 'already_plus', reason: 'grandfathered' });
  assert.equal(plus.success, true);

  // A refusal a shipped build has no branch for must still be READABLE.
  assert.equal(BillingRefusalSchema.safeParse({ error: 'invented_later' }).success, true);
  assert.equal(isBillingRefusalCode('invented_later'), false);
});

// ---------------------------------------------------------------------------
// /api/notifications/*
// ---------------------------------------------------------------------------

test('NotificationPreferencesResponseSchema: parses the real preferences body', () => {
  const r = NotificationPreferencesResponseSchema.safeParse(NOTIFICATION_PREFERENCES_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.preferences.dailyGlance, false);
  assert.equal(r.data?.notificationsEnabled, true);
  assert.equal(r.data?.emailEngagement, false);
});

test('NOTIFICATION_PREFERENCE_KEYS: the ten switches the server writes', () => {
  assert.equal(NOTIFICATION_PREFERENCE_KEYS.length, 10);
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    assert.ok(key in NOTIFICATION_PREFERENCES_BODY.preferences, `${key} is missing`);
  }
});

test('NotificationPreferencesResponseSchema: preferences default to {} when absent', () => {
  const r = NotificationPreferencesResponseSchema.safeParse({ notificationsEnabled: false });
  assert.equal(r.success, true);
  assert.deepEqual(r.data?.preferences, {});
});

test('NotificationPreferencesUpdateRequestSchema: the PATCH body is FLAT', () => {
  const r = NotificationPreferencesUpdateRequestSchema.safeParse({
    mealReminder: false,
    dailyGlance: true,
    emailEngagement: false,
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.mealReminder, false);
  // Nesting them is the mistake the server silently ignores, so it must not
  // typecheck as a valid update: nothing survives the parse.
  const nested = NotificationPreferencesUpdateRequestSchema.safeParse({
    preferences: { mealReminder: false },
  });
  assert.equal(nested.success, true);
  assert.deepEqual(nested.data, {});
});

test('PushSubscribeRequestSchema: web needs keys, native carries a token', () => {
  const web = PushSubscribeRequestSchema.safeParse({
    endpoint: 'https://fcm.googleapis.com/fcm/send/dQw4w9Wg:APA91bG',
    keys: { p256dh: 'BN1cs...', auth: 'k9Lp...' },
    platform: 'web',
  });
  assert.equal(web.success, true);

  const native = PushSubscribeRequestSchema.safeParse({
    endpoint: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    platform: 'ios',
    reenable: true,
  });
  assert.equal(native.success, true);

  assert.equal(PushSubscribeRequestSchema.safeParse({ platform: 'ios' }).success, false);
  assert.equal(
    PushSubscribeRequestSchema.safeParse({ endpoint: 'x', platform: 'watchos' }).success,
    false,
  );
});

test('PushUnsubscribeRequestSchema: no endpoint means "all devices, off"', () => {
  assert.equal(PushUnsubscribeRequestSchema.safeParse({}).success, true);
  assert.equal(PushUnsubscribeRequestSchema.safeParse({ endpoint: 'https://x/y' }).success, true);
});

test('NotificationsMutationResponseSchema: parses { success: true }', () => {
  assert.equal(NotificationsMutationResponseSchema.safeParse({ success: true }).success, true);
  assert.equal(NotificationsMutationResponseSchema.safeParse({}).success, false);
});

// ---------------------------------------------------------------------------
// GET /api/widgets/summary
// ---------------------------------------------------------------------------

test('WidgetFeedSchema: parses a real feed, five widgets in gallery order', () => {
  const r = WidgetFeedSchema.safeParse(WIDGET_FEED_BODY);
  assert.equal(r.success, true);
  assert.deepEqual(r.data?.widgets.map((w) => w.key), [
    'streak',
    'nutrition',
    'mind',
    'becoming',
    'training',
  ]);
  assert.equal(r.data?.refreshAfterSeconds, 900);
  assert.equal(r.data?.badgeCount, 2);
  const nutrition = r.data?.widgets[1];
  assert.equal(nutrition?.rings.length, 4);
  assert.equal(nutrition?.rings[0]?.unit, 'cal');
});

test('WidgetFeedSchema: a member with no targets ships null rings, not zeros', () => {
  const r = WidgetFeedSchema.safeParse({
    generatedAt: 1789570800000,
    todayKey: '2026-09-16',
    refreshAfterSeconds: 900,
    widgets: [
      {
        key: 'nutrition',
        title: 'Nutrition',
        headline: '0',
        headlineUnit: 'cal',
        caption: 'Nothing logged yet today',
        state: 'todo',
        progress: null,
        rings: [
          { key: 'calories', label: 'Cal', value: 0, target: null, pct: null, unit: 'cal' },
        ],
        deepLink: '/dashboard/nutrition',
      },
    ],
    badgeCount: 0,
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.widgets[0]?.progress, null);
  assert.equal(r.data?.widgets[0]?.rings[0]?.target, null);
});

test('WidgetFeedSchema: rejects a state no renderer can draw', () => {
  const broken = {
    ...WIDGET_FEED_BODY,
    widgets: [{ ...WIDGET_FEED_BODY.widgets[0], state: 'maybe' }],
  };
  assert.equal(WidgetFeedSchema.safeParse(broken).success, false);
});

// ---------------------------------------------------------------------------
// /api/me/account + /api/me/account/restore
// ---------------------------------------------------------------------------

test('AccountStatusResponseSchema: parses a pending deletion', () => {
  const r = AccountStatusResponseSchema.safeParse(ACCOUNT_STATUS_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.deletion.pending, true);
  assert.equal(r.data?.deletion.daysLeft, 6);
  assert.equal(r.data?.confirmation, DELETE_CONFIRMATION);
  assert.equal(r.data?.covers.length, 2);
});

test('AccountStatusResponseSchema: parses an account with nothing pending', () => {
  const r = AccountStatusResponseSchema.safeParse({
    email: 'jon@example.com',
    deletion: CANCEL_DELETION_BODY.deletion,
    covers: [],
    exceptions: [],
    confirmation: 'DELETE',
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.deletion.pending, false);
});

test('DeleteAccountRequestSchema: the confirmation must be spelled out', () => {
  assert.equal(
    DeleteAccountRequestSchema.safeParse({ confirm: DELETE_CONFIRMATION, source: 'ios' }).success,
    true,
  );
  assert.equal(DeleteAccountRequestSchema.safeParse({}).success, false);
  assert.equal(DeleteAccountRequestSchema.safeParse({ confirm: true }).success, false);
  assert.equal(DeleteAccountRequestSchema.safeParse({ confirm: 'delete' }).success, false);
  assert.equal(
    DeleteAccountRequestSchema.safeParse({ confirm: 'DELETE', source: 'watch' }).success,
    false,
  );
});

test('DeleteAccountResponseSchema: parses the scheduled deletion', () => {
  const r = DeleteAccountResponseSchema.safeParse(DELETE_ACCOUNT_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.pushSubscriptionsDropped, 2);
  assert.equal(r.data?.deletion.restorableUntil, '2026-09-23T09:12:00.000Z');
});

test('DeleteAccountResponseSchema: parses the already-pending answer', () => {
  const r = DeleteAccountResponseSchema.safeParse({
    ok: true,
    alreadyPending: true,
    deletion: ACCOUNT_STATUS_BODY.deletion,
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.alreadyPending, true);
});

test('DeleteAccountRefusalSchema: parses the unconfirmed 400', () => {
  const r = DeleteAccountRefusalSchema.safeParse({
    error: 'confirmation_required',
    confirmation: 'DELETE',
  });
  assert.equal(r.success, true);
});

test('CancelDeletion: a literal cancel, answering with a cleared status', () => {
  assert.equal(CancelDeletionRequestSchema.safeParse({ cancel: true }).success, true);
  assert.equal(CancelDeletionRequestSchema.safeParse({ cancel: false }).success, false);
  const r = CancelDeletionResponseSchema.safeParse(CANCEL_DELETION_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.deletion?.pending, false);
});

test('RestoreAccount: the link carries the credential, and one refusal', () => {
  assert.equal(
    RestoreAccountRequestSchema.safeParse({ u: '68f1c2a9b4d3e10012ab34cd', t: 'a3f1…' }).success,
    true,
  );
  assert.equal(RestoreAccountRequestSchema.safeParse({ u: 'x' }).success, false);

  assert.equal(RestoreAccountResponseSchema.safeParse(RESTORE_BODY).success, true);
  const refused = RestoreAccountResponseSchema.safeParse({
    ok: false,
    error: 'invalid_or_expired',
  });
  assert.equal(refused.success, true);
  assert.equal(refused.data?.ok, false);
});

// ---------------------------------------------------------------------------
// /api/tutorial-progress + /api/feedback
// ---------------------------------------------------------------------------

test('TutorialProgressStateSchema: parses a stored progress blob', () => {
  const r = TutorialProgressStateSchema.safeParse(TUTORIAL_PROGRESS_BODY);
  assert.equal(r.success, true);
  const entry = TutorialProgressEntrySchema.safeParse(
    TUTORIAL_PROGRESS_BODY['become-onboarding'],
  );
  assert.equal(entry.success, true);
  assert.equal(entry.data?.segments?.home, 'completed');
  // A member with nothing stored gets a 204; an empty blob parses too.
  assert.equal(TutorialProgressStateSchema.safeParse({}).success, true);
});

test('FeedbackRequestSchema: a message is the only thing required', () => {
  const r = FeedbackRequestSchema.safeParse({
    type: 'bug',
    message: 'The plan page shows Manage billing with the kill-switch off.',
    images: [{ name: 'screenshot-1.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
    metadata: { screen: 'plan', build: '1.4.2' },
  });
  assert.equal(r.success, true);
  assert.equal(FeedbackRequestSchema.safeParse({ message: 'just this' }).success, true);
  assert.equal(FeedbackRequestSchema.safeParse({ message: '' }).success, false);
  assert.equal(FeedbackRequestSchema.safeParse({ type: 'bug' }).success, false);
});

test('FeedbackResponseSchema: parses the created feedback', () => {
  const r = FeedbackResponseSchema.safeParse(FEEDBACK_BODY);
  assert.equal(r.success, true);
  assert.equal(r.data?.id, '68f1c2a9b4d3e10012ab34ce');
});

// ---------------------------------------------------------------------------
// The rule that travels: the server may extend any of these.
//
// A store build is installed for months and answers to whatever the server is
// on THAT day. Every response schema above therefore has to survive a field it
// has never heard of — and keep it, so a screen can read a value the schema
// does not describe yet.
// ---------------------------------------------------------------------------

const RESPONSES: Array<[string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, Record<string, unknown>]> = [
  ['GET /api/auth/me', MeResponseSchema, ME_BODY],
  ['GET|PATCH /api/profile', ProfileResponseSchema, PROFILE_BODY],
  ['GET|POST /api/me/consent', ConsentStatusSchema, CONSENT_BODY],
  ['GET|POST|DELETE /api/me/ai-consent', AiConsentStatusSchema, AI_CONSENT_BODY],
  ['GET /api/me/entitlements', EntitlementsResponseSchema, ENTITLEMENTS_BODY],
  ['GET /api/billing/status', BillingStatusResponseSchema, BILLING_STATUS_BODY],
  ['POST /api/billing/checkout', CheckoutResponseSchema, CHECKOUT_BODY],
  ['POST /api/billing/portal', PortalResponseSchema, PORTAL_BODY],
  ['GET /api/notifications/preferences', NotificationPreferencesResponseSchema, NOTIFICATION_PREFERENCES_BODY],
  ['POST /api/notifications/subscribe', NotificationsMutationResponseSchema, { success: true }],
  ['POST /api/notifications/unsubscribe', NotificationsMutationResponseSchema, { success: true }],
  ['GET /api/widgets/summary', WidgetFeedSchema, WIDGET_FEED_BODY],
  ['GET /api/me/account', AccountStatusResponseSchema, ACCOUNT_STATUS_BODY],
  ['DELETE /api/me/account', DeleteAccountResponseSchema, DELETE_ACCOUNT_BODY],
  ['POST /api/me/account', CancelDeletionResponseSchema, CANCEL_DELETION_BODY],
  ['POST /api/me/account/restore', RestoreAccountResponseSchema, RESTORE_BODY],
  ['GET /api/tutorial-progress', TutorialProgressStateSchema, TUTORIAL_PROGRESS_BODY],
  ['POST /api/feedback', FeedbackResponseSchema, FEEDBACK_BODY],
];

for (const [route, schema, body] of RESPONSES) {
  test(`${route}: an unknown field still parses, and survives`, () => {
    const parsed = schema.safeParse({ ...body, fieldFromAFutureServer: 'kept' });
    assert.equal(parsed.success, true, `${route} rejected an unknown field`);
    assert.equal(
      (parsed.data as Record<string, unknown>).fieldFromAFutureServer,
      'kept',
      `${route} dropped an unknown field`,
    );
  });
}

test('the sweep covers every route this card added a schema for', () => {
  assert.equal(RESPONSES.length, 18);
});

// Nested objects are extended too, not just the envelope.
test('nested objects pass unknown fields through as well', () => {
  const profile = ProfileResponseSchema.safeParse({
    ...PROFILE_BODY,
    profile: { ...PROFILE_BODY.profile, somethingOnboardingAddedLater: 'kept' },
  });
  assert.equal(profile.success, true);
  assert.equal(
    (profile.data?.profile as Record<string, unknown>).somethingOnboardingAddedLater,
    'kept',
  );

  const consent = ConsentStatusSchema.safeParse({
    ...CONSENT_BODY,
    ai: { ...CONSENT_BODY.ai, providerRegion: 'eu' },
  });
  assert.equal(consent.success, true);
  assert.equal((consent.data?.ai as Record<string, unknown>).providerRegion, 'eu');

  const entitlements = EntitlementsResponseSchema.safeParse({
    ...ENTITLEMENTS_BODY,
    features: {
      ...ENTITLEMENTS_BODY.features,
      vision: { ...ENTITLEMENTS_BODY.features.vision, upgradeCopy: 'Plus unlocks vision' },
    },
  });
  assert.equal(entitlements.success, true);
  assert.equal(
    (entitlements.data?.features.vision as Record<string, unknown>).upgradeCopy,
    'Plus unlocks vision',
  );

  const widgets = WidgetFeedSchema.safeParse({
    ...WIDGET_FEED_BODY,
    widgets: [{ ...WIDGET_FEED_BODY.widgets[0], accessibilityLabel: 'Five day streak' }],
  });
  assert.equal(widgets.success, true);
  assert.equal(
    (widgets.data?.widgets[0] as unknown as Record<string, unknown>).accessibilityLabel,
    'Five day streak',
  );

  const account = AccountStatusResponseSchema.safeParse({
    ...ACCOUNT_STATUS_BODY,
    deletion: { ...ACCOUNT_STATUS_BODY.deletion, purgeJobId: 'job_9' },
  });
  assert.equal(account.success, true);
  assert.equal((account.data?.deletion as Record<string, unknown>).purgeJobId, 'job_9');
});
