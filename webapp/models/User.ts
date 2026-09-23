import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';

export type UserRole = 'user' | 'trainer' | 'admin';
/** Collapsed from free|plus|premium|pro. A 'coach' tier is planned but not
 *  implemented; legacy 'premium'/'pro' rows are promoted by
 *  scripts/migrate-tiers.mjs and read as 'free' until they are. */
export type Tier = 'free' | 'plus';
/** Mirrors Stripe's subscription statuses, plus 'none' for "never subscribed".
 *  'incomplete_expired' and 'paused' are real statuses Stripe emits — they are
 *  listed because the mongoose enum below REJECTS anything absent from it, and
 *  a rejected write means the webhook 500s and Stripe retries the same event
 *  forever. Both derive to `free` (deriveTier's default branch). */
export type SubscriptionStatus =
  | 'none' | 'trialing' | 'active' | 'past_due' | 'canceled'
  | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
export type FitnessGoal = 'lose_weight' | 'gain_muscle' | 'maintain' | 'improve_performance' | 'general_health';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say';
export type EquipmentType = 'none' | 'dumbbells' | 'barbell' | 'cables' | 'full_gym';

export interface ISavedProgram {
  programId: string;
  savedAt: Date;
  order: number;
}

export interface ISavedFood {
  foodId: mongoose.Types.ObjectId;
  savedAt: Date;
}

export type WeightUnit = 'lbs' | 'kg';

export type PlanPromoteMode = 'manual' | 'auto';

export type NutritionDirection = 'lose' | 'maintain' | 'gain';

export interface IUserProfile {
  /** The PRIMARY goal. Always mirrors fitnessGoals[0]; kept as its own field
   *  because the dashboard, nudge modal, profile icon and AI context all key
   *  off a single goal. */
  fitnessGoal?: FitnessGoal;
  /** Ordered goal set from onboarding — index 0 is the primary. Members can
   *  pick up to 3; secondary goals influence program recommendations and the
   *  protein target without diluting the primary. */
  fitnessGoals?: FitnessGoal[];
  /** Explicit calorie direction. Defaults from the primary goal during
   *  onboarding but is the member's own choice — "build muscle" does not
   *  always mean "eat in a surplus". */
  nutritionDirection?: NutritionDirection;
  experienceLevel?: ExperienceLevel;
  age?: number;
  biologicalSex?: BiologicalSex;
  heightCm?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  equipmentAccess?: EquipmentType[];
  injuryNotes?: string;
  weeklyAvailability?: number;
  weightUnit?: WeightUnit;
  /**
   * When a meal plan's date arrives, how should it be handled?
   *   'manual' — show the plan as a "Tap to log" row. Default.
   *   'auto'   — promote silently on the first day-view load that day.
   * Per-plan override is not in v1 — global pref only.
   */
  planPromoteMode?: PlanPromoteMode;
}

export interface IUserSubscription {
  status: SubscriptionStatus;
  /** End of the paid period. Used only to expire a stale 'active' and to honor
   *  a 'canceled' sub through the period the member already paid for. */
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string | null;
  stripeTestCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  priceId?: string | null;
  /** Which configured price this maps to. Cosmetic — the UI's plan label. May
   *  be absent for an unrecognised price; `status` is what decides tier. */
  plan?: 'monthly' | 'annual' | null;
  /** Which Stripe account wrote this state. Production and beta share ONE
   *  database, so without it a test-mode event on beta is indistinguishable
   *  from a live one and would overwrite a real subscription. See
   *  lib/billing/mode.ts#canApplyMode. */
  mode?: 'test' | 'live' | null;
  /** Stamped by invoice.payment_failed, for dunning copy only. It does NOT set
   *  tier — the customer.subscription.updated → past_due event does that. */
  paymentFailedAt?: Date | null;
  /** Last webhook event applied. Guards out-of-order webhook delivery. */
  lastEventId?: string | null;
  /** `event.created` (epoch SECONDS) of the last event applied — STRIPE's clock,
   *  which is the only thing an incoming `event.created` may be compared
   *  against. Comparing it to `updatedAt` (ours) dropped every event in a burst
   *  but the first, because delivery latency is always positive. See
   *  lib/billing/apply.ts#isStaleEvent. */
  lastEventCreated?: number | null;
  updatedAt?: Date;
}

/**
 * The record that a member agreed to the Terms and Privacy Policy and said
 * they were old enough to. ONE record, overwritten on each re-consent: the
 * current agreement is the evidence that matters, and the version + timestamp
 * say which text it was. Absent on every row written before 2026-09-13 —
 * nobody had agreed to anything — which is exactly what the in-app gate
 * (components/ConsentGate.tsx) exists to repair.
 */
export interface IUserConsent {
  /** LEGAL_VERSION at the moment of agreement. */
  termsVersion: string
  acceptedAt: Date
  /** LEGAL_MINIMUM_AGE as it stood — the age the member attested to. */
  minimumAge: number
  /** Where the tick happened: the sign-up form, the in-app gate, or a Stripe
   *  checkout (Stripe's own consent_collection, mirrored here on session end). */
  source: 'signup' | 'gate' | 'checkout'
}

/** Email categories a member can opt out of. Absent = ON, same convention as
 *  UserProgress.notificationPrefs. `engagement` is the streak / milestone mail
 *  (lib/email.ts), the only non-transactional email Become sends; sign-in
 *  links are transactional and carry no opt-out. Set to false by the
 *  unsubscribe link in every engagement email (app/api/email/unsubscribe) and
 *  by the toggle in Settings. */
export interface IUserEmailPreferences {
  engagement?: boolean
}

/**
 * A pending "delete my account", and the window in which it can be undone.
 *
 * PRESENT = DELETION REQUESTED. Absent (the normal state) means nothing is
 * pending, so no existing row needs a migration and no read path has to know
 * about this field to keep working.
 *
 * The request is a SOFT delete on purpose — one mis-tap would otherwise destroy
 * a training history nobody can rebuild. Push subscriptions are dropped at
 * REQUEST time (not at purge time), because "stop contacting me" is the part of
 * the request that must not wait seven days. `lib/accountDeletion.ts` carries
 * the rest of the argument; `app/api/cron/purge-deletions` does the sweep.
 */
export interface IUserDeletion {
  requestedAt: Date
  /** requestedAt + ACCOUNT_DELETION_GRACE_DAYS. Stored, not recomputed, so
   *  changing the constant never moves a window a member was already told. */
  scheduledPurgeAt: Date
  /** Which client asked — the trail an App Store reviewer's request leaves. */
  source: 'web' | 'ios' | 'android'
}

export interface IUser {
  _id?: string
  email: string
  password: string
  name: string
  role: UserRole
  consent?: IUserConsent
  emailPreferences?: IUserEmailPreferences
  /** Present only while a deletion is pending. See IUserDeletion. */
  deletion?: IUserDeletion
  /** DERIVED, persisted. Only admin tooling, scripts/migrate-tiers.mjs, or the
   *  billing webhook may write this — never derived at request time, because
   *  that would grandfather members automatically. Readers use
   *  loadUserEntitlement(), which reads this stored value. */
  tier: Tier
  /** Raw billing truth. Separate from `tier` on purpose: tier is the
   *  projection, this is the source. past_due deliberately does NOT project to
   *  plus. See lib/subscription.ts#deriveTier. */
  subscription?: IUserSubscription
  /** Legacy member promoted by the offline migration, not by a payment. */
  grandfathered?: boolean
  /** When scripts/notify-grandfathered.mjs told this member what they hold.
   *  The script skips anyone who has it, so a rerun cannot email twice. */
  grandfatheredNotifiedAt?: Date
  trainerId?: mongoose.Types.ObjectId | string
  savedPrograms?: ISavedProgram[];
  savedFoods?: ISavedFood[];
  profile?: IUserProfile;
  onboardingCompleted?: boolean;
  /** Stable id of this user's identity in the redauth auth store (the join key
   *  between Become's user data and the shared auth layer). Set on first
   *  redauth-backed login (Google / passkey); backfilled by email for existing
   *  magic-link/password users. */
  authId?: string;
  /** Profile picture from a social provider (e.g. Google) or a custom upload. */
  avatarUrl?: string;
  /** Equipped profile icon: a PRESET_ICONS id, or 'custom' to use avatarUrl.
   *  Default is derived from the onboarding fitness goal. */
  profileIcon?: string;
  createdAt?: Date
  updatedAt?: Date
}

interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>
}

type UserModel = Model<IUser, object, IUserMethods>

const SavedProgramSchema = new Schema({
  programId: { type: String, required: true },
  savedAt: { type: Date, default: Date.now },
  order: { type: Number, default: 0 },
}, { _id: false });

const SavedFoodSchema = new Schema({
  foodId: { type: Schema.Types.ObjectId, ref: 'Food', required: true },
  savedAt: { type: Date, default: Date.now },
}, { _id: false });

const UserProfileSchema = new Schema({
  fitnessGoal: { type: String, enum: ['lose_weight', 'gain_muscle', 'maintain', 'improve_performance', 'general_health'] },
  fitnessGoals: [{ type: String, enum: ['lose_weight', 'gain_muscle', 'maintain', 'improve_performance', 'general_health'] }],
  nutritionDirection: { type: String, enum: ['lose', 'maintain', 'gain'] },
  experienceLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  age: { type: Number },
  biologicalSex: { type: String, enum: ['male', 'female', 'prefer_not_to_say'] },
  heightCm: { type: Number },
  currentWeightKg: { type: Number },
  targetWeightKg: { type: Number },
  equipmentAccess: [{ type: String, enum: ['none', 'dumbbells', 'barbell', 'cables', 'full_gym'] }],
  injuryNotes: { type: String },
  weeklyAvailability: { type: Number, min: 1, max: 7 },
  weightUnit: { type: String, enum: ['lbs', 'kg'], default: 'lbs' },
  planPromoteMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
}, { _id: false });

const UserSubscriptionSchema = new Schema<IUserSubscription>({
  status: {
    type: String,
    enum: [
      'none', 'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused',
    ],
    default: 'none',
  },
  currentPeriodEnd: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  stripeCustomerId: { type: String, default: null },
  stripeTestCustomerId: { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },
  priceId: { type: String, default: null },
  plan: { type: String, enum: ['monthly', 'annual', null], default: null },
  mode: { type: String, enum: ['test', 'live', null], default: null },
  paymentFailedAt: { type: Date, default: null },
  lastEventId: { type: String, default: null },
  lastEventCreated: { type: Number, default: null },
  updatedAt: { type: Date },
}, { _id: false });

const UserConsentSchema = new Schema<IUserConsent>({
  termsVersion: { type: String, required: true },
  acceptedAt: { type: Date, required: true },
  minimumAge: { type: Number, required: true },
  source: { type: String, enum: ['signup', 'gate', 'checkout'], required: true },
}, { _id: false });

const UserEmailPreferencesSchema = new Schema<IUserEmailPreferences>({
  engagement: { type: Boolean },
}, { _id: false });

const UserDeletionSchema = new Schema<IUserDeletion>({
  requestedAt: { type: Date, required: true },
  scheduledPurgeAt: { type: Date, required: true },
  source: { type: String, enum: ['web', 'ios', 'android'], required: true },
}, { _id: false });

const UserSchema = new Schema<IUser, UserModel, IUserMethods>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  role: { type: String, enum: ['user', 'trainer', 'admin'], default: 'user' },
  consent: { type: UserConsentSchema, default: undefined },
  emailPreferences: { type: UserEmailPreferencesSchema, default: undefined },
  // `default: undefined`, like `consent` above: an EMPTY subdocument would
  // otherwise be written on every user and "is a deletion pending?" would stop
  // being answerable by the presence of the field.
  deletion: { type: UserDeletionSchema, default: undefined },
  // New users land on 'free'. Existing members are promoted to 'plus' ONCE,
  // offline, by scripts/migrate-tiers.mjs — never automatically at request
  // time. Legacy 'premium'/'pro' values still on disk are not rejected on read
  // (Mongoose only validates writes) and read as 'free' until migrated.
  //
  // WRITES ARE THE TRAP, AND THEY SHIP WITH THE ENUM, NOT WITH THE
  // KILL-SWITCH. save() validates every INITIALIZED path, so touching ANY
  // field on a hydrated legacy user throws `tier: 'pro' is not a valid enum
  // value` — an admin PATCH with runValidators, and (verified against mongoose
  // 9.6.3) a plain save() too. Run scripts/migrate-tiers.mjs BEFORE the
  // deploy, not merely before flipping ENTITLEMENTS_ENFORCED, and pass
  // { validateModifiedOnly: true } on any save() of a pre-existing user
  // document (see lib/authBridge.ts).
  tier: { type: String, enum: ['free', 'plus'], default: 'free' },
  subscription: { type: UserSubscriptionSchema, default: undefined },
  grandfathered: { type: Boolean, default: false },
  grandfatheredNotifiedAt: { type: Date, default: undefined },
  trainerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  savedPrograms: [SavedProgramSchema],
  savedFoods: [SavedFoodSchema],
  profile: { type: UserProfileSchema, default: {} },
  onboardingCompleted: { type: Boolean, default: false },
  authId: { type: String, default: null },
  avatarUrl: { type: String },
  profileIcon: { type: String },
}, {
  timestamps: true,
})

// Index to support fast lookups of users by saved food (and basic membership tests)
UserSchema.index({ 'savedFoods.foodId': 1 })
// Stable link to the redauth identity. PARTIAL (not sparse) unique: a sparse
// index still indexes docs where authId is present-but-null, and because the
// field defaults to null every magic-link signup writes an explicit null — so
// the 2nd such user hit E11000 (authId: null dup). Partial on {$type:'string'}
// indexes only real authIds, letting unlimited null/absent users coexist.
UserSchema.index(
  { authId: 1 },
  { unique: true, partialFilterExpression: { authId: { $type: 'string' } } }
)
// Webhook lookup by Stripe customer. PARTIAL for the same reason authId is:
// every user defaults the field to null, so a sparse index would still index
// them all and a unique constraint would E11000 on the second signup. The
// partial filter excludes those nulls, which is what makes UNIQUE safe here.
//
// And unique is not a nicety: findUserIdByRef() resolves an event with a single
// findOne() on these fields. Two users holding one customer id means the
// webhook updates whichever document Mongo happens to return — one member's
// payment silently granting or revoking another's access, with nothing in the
// logs to say so. Unique makes that state unrepresentable instead of
// undetectable. (Zero subscription documents exist today, so the build is free.)
UserSchema.index(
  { 'subscription.stripeCustomerId': 1 },
  { unique: true, partialFilterExpression: { 'subscription.stripeCustomerId': { $type: 'string' } } }
)
UserSchema.index(
  { 'subscription.stripeTestCustomerId': 1 },
  { unique: true, partialFilterExpression: { 'subscription.stripeTestCustomerId': { $type: 'string' } } }
)
// invoice.payment_failed carries a subscription, not always a resolvable
// customer — this is the fallback lookup path for it. Partial + unique for the
// same reasons as the two above.
UserSchema.index(
  { 'subscription.stripeSubscriptionId': 1 },
  { unique: true, partialFilterExpression: { 'subscription.stripeSubscriptionId': { $type: 'string' } } }
)
// ONE-TIME, BEFORE THE FIRST DEPLOY THAT CARRIES THIS FILE: if the three
// indexes above already exist as NON-unique (they were created that way), Mongo
// refuses to redefine them in place. autoIndex's createIndex comes back
// IndexKeySpecsConflict (86), Mongoose reports it on the model's 'error' event,
// nothing crashes, and the constraint silently does not exist. Drop them once
// and let autoIndex rebuild them:
//
//   db.users.dropIndex('subscription.stripeCustomerId_1')
//   db.users.dropIndex('subscription.stripeTestCustomerId_1')
//   db.users.dropIndex('subscription.stripeSubscriptionId_1')
//
// Safe while there are zero subscription documents, which is the state today.
// Once money is flowing, a drop leaves the webhook's lookup on a collection
// scan for as long as the rebuild takes.

// Admin/ops: "who is on what".
UserSchema.index({ tier: 1, grandfathered: 1 })

// The deletion sweep's only query: "whose grace window has closed?". PARTIAL,
// so it indexes the handful of rows with a deletion pending instead of every
// member — and, unlike a sparse index, it cannot be widened later by a write
// that sets the field to null.
UserSchema.index(
  { 'deletion.scheduledPurgeAt': 1 },
  { partialFilterExpression: { 'deletion.scheduledPurgeAt': { $type: 'date' } } }
)

// Hash password before saving
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return
  
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string) {
  return bcrypt.compare(candidatePassword, this.password)
}

export default mongoose.models.User || mongoose.model<IUser, UserModel>('User', UserSchema)