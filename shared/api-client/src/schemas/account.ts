import { z } from 'zod';

/**
 * The account area's wire contract: the member's profile, and the two other
 * account-scoped routes the settings screens call.
 *
 * WHY THIS FILE EXISTS. `UserProfileSchema` used to describe a profile the
 * server stopped storing: `goal`, `trainingExperience`, `primaryFocus` and
 * `birthYear`. PATCH /api/profile writes through an explicit allow-list
 * (webapp/app/api/profile/route.ts → ALLOWED_PROFILE_KEYS), so every one of
 * those keys was silently dropped — a native onboarding could "succeed" and
 * store nothing. The shape below IS that allow-list, key for key.
 *
 * TYPES ARE DELIBERATELY LOOSE ON THE CLOSED-ISH UNIONS. `fitnessGoal`,
 * `experienceLevel`, `biologicalSex`, `equipmentAccess` and friends are unions
 * in webapp/models/User.ts today, and the values are listed in the comments —
 * but a member's stored profile is read by a build that may be months older
 * than the server, and a new goal value must not make the whole profile
 * unparseable. The server is the only side that validates them.
 *
 * Everything is optional: a profile sub-document may hold any subset, and GET
 * /api/profile returns `{}` for a member who has never onboarded.
 */
export const UserProfileSchema = z
  .object({
    /** Primary goal. Mirrors `fitnessGoals[0]`. Today: 'lose_weight' |
     *  'gain_muscle' | 'maintain' | 'improve_performance' | 'general_health'. */
    fitnessGoal: z.string().optional(),
    /** Ordered goal set from onboarding — index 0 is the primary, up to 3. */
    fitnessGoals: z.array(z.string()).optional(),
    /** Calorie direction. Today: 'lose' | 'maintain' | 'gain'. */
    nutritionDirection: z.string().optional(),
    /** Today: 'beginner' | 'intermediate' | 'advanced'. */
    experienceLevel: z.string().optional(),
    /** Years. The server refuses a PATCH below the legal minimum age — see
     *  AgeBelowMinimumErrorSchema. */
    age: z.number().optional(),
    /** Today: 'male' | 'female' | 'prefer_not_to_say'. */
    biologicalSex: z.string().optional(),
    heightCm: z.number().optional(),
    currentWeightKg: z.number().optional(),
    targetWeightKg: z.number().optional(),
    /** Today: 'none' | 'dumbbells' | 'barbell' | 'cables' | 'full_gym'. */
    equipmentAccess: z.array(z.string()).optional(),
    injuryNotes: z.string().optional(),
    /** Sessions per week the member says they can train. */
    weeklyAvailability: z.number().optional(),
    /** Display unit. Today: 'lbs' | 'kg'. */
    weightUnit: z.string().optional(),
    /** How a due meal plan is handled. Today: 'manual' | 'auto'. */
    planPromoteMode: z.string().optional(),
  })
  .passthrough();

/**
 * GET /api/profile and PATCH /api/profile both answer with this.
 *
 * `profileIcon`, `avatarUrl` and `createdAt` are explicitly `?? null` on the
 * server, and `createdAt` rides on the GET only — PATCH's projection carries
 * it but its response body does not — so all three are nullish here.
 */
export const ProfileResponseSchema = z
  .object({
    profile: UserProfileSchema.nullish(),
    onboardingCompleted: z.boolean().optional(),
    name: z.string().nullish(),
    email: z.string().optional(),
    profileIcon: z.string().nullish(),
    avatarUrl: z.string().nullish(),
    createdAt: z.string().nullish(),
  })
  .passthrough();

/**
 * PATCH /api/profile body. Everything is optional but the server refuses a
 * body that resolves to no writable field at all (400 'No fields to update'),
 * and it ignores any profile key outside the allow-list above.
 */
export const ProfileUpdateRequestSchema = z.object({
  profile: UserProfileSchema.optional(),
  onboardingCompleted: z.boolean().optional(),
  name: z.string().optional(),
  profileIcon: z.string().optional(),
  avatarUrl: z.string().optional(),
});

/** PATCH /api/profile 400 when `profile.age` is under the legal minimum. The
 *  age gate, on the one field that states an age outright. */
export const AgeBelowMinimumErrorSchema = z
  .object({
    error: z.literal('age_below_minimum'),
    minimumAge: z.number().optional(),
  })
  .passthrough();

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;
export type AgeBelowMinimumError = z.infer<typeof AgeBelowMinimumErrorSchema>;

// ---------------------------------------------------------------------------
// Tutorial progress — GET | PUT /api/tutorial-progress
//
// Account-scoped (that is the whole point of the route: a tour that ran on the
// web must not replay on the phone), which is why it lives with the account
// schemas rather than in a module of its own.
//
// The blob's shape is owned by @redbtn/redtutorial — the server round-trips
// whatever `parseProgressState` accepts and stores it as Mixed — so the state
// is typed as an open record and only the ENTRY we read (status/version/
// per-segment outcome, see webapp/lib/tutorials/onboardingSettled.ts) is
// described. GET answers 204 with NO BODY when nothing is stored yet, and PUT
// answers 204 as well; neither is a JSON body to parse.
// ---------------------------------------------------------------------------

/** One tutorial's entry inside the progress blob, keyed by tutorial id. */
export const TutorialProgressEntrySchema = z
  .object({
    /** Today: 'completed' | 'dismissed' | 'in-progress'. */
    status: z.string().optional(),
    /** Progress is stored per (id, version); a stale version replays the tour. */
    version: z.number().optional(),
    /** Per-segment outcome, keyed by segment name. */
    segments: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

/** GET /api/tutorial-progress 200 body (204 when the member has no progress). */
export const TutorialProgressStateSchema = z.record(z.string(), z.unknown());

export type TutorialProgressEntry = z.infer<typeof TutorialProgressEntrySchema>;
export type TutorialProgressState = z.infer<typeof TutorialProgressStateSchema>;

// ---------------------------------------------------------------------------
// Feedback — POST /api/feedback
// ---------------------------------------------------------------------------

/** An attached screenshot: a filename and a `data:image/…;base64,…` URL. The
 *  server keeps the first three and drops anything that is not a data image. */
export const FeedbackImageSchema = z.object({
  name: z.string(),
  dataUrl: z.string(),
});

/**
 * POST /api/feedback body. `message` is the only required field: an empty one
 * is a 400. An unrecognised `type` is not refused — it is recorded as
 * 'general' — so the union is documented rather than enforced.
 */
export const FeedbackRequestSchema = z.object({
  /** Today: 'bug' | 'feature' | 'general' | 'nutrition_generation'. */
  type: z.string().optional(),
  message: z.string().min(1),
  images: z.array(FeedbackImageSchema).optional(),
  /** Free-form context. Serialised and truncated server-side. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** POST /api/feedback 200 → `{ success: true, id }`. */
export const FeedbackResponseSchema = z
  .object({
    success: z.boolean(),
    id: z.string().optional(),
  })
  .passthrough();

export type FeedbackImage = z.infer<typeof FeedbackImageSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
