/**
 * The auth shapes the webapp itself needs as types: a hand copy of
 * `shared/api-client/src/schemas/auth.ts` + `account.ts` — and held to them,
 * key for key, by `tests/unit/contract/sharedApiTypes.test.ts`.
 *
 * WHY A COPY AND NOT AN IMPORT
 *
 * `webapp/Dockerfile` builds with the build context set to `webapp/`
 * (`COPY . .`, RedRun `baseDirectory: webapp`), so `../shared` does not exist
 * in the image. `import type { MeResponse } from '@become/api-client'`
 * typechecks on a dev box, where the sibling package is on disk, and fails the
 * production build, where it is not. Tests are the one place that may reach
 * the shared package — they run from the full checkout, and CI installs its
 * lockfile before the webapp suite (see `tests/unit/contract/_contract.ts`).
 *
 * SO THE COPY IS NOT TRUSTED — IT IS TESTED
 *
 * `tests/unit/contract/sharedApiTypes.test.ts` compares every schema below
 * with its counterpart in `shared/api-client`, at every depth: a field added,
 * dropped, renamed, retyped or made optional on either side fails the webapp
 * suite. When the shared schema moves, move this file in the SAME pull
 * request — the same rule every contract test in that directory enforces.
 *
 * `zod` is declared in webapp/package.json for this file. It used to be
 * imported from a hoisted transitive copy, which worked by accident and would
 * have vanished the day a dependency dropped it.
 *
 * NOTHING ELSE LIVES HERE. The programs / schedule / mood / weight / workout
 * shapes this file used to carry were hand copies nobody imported, of domains
 * `shared/api-client` now owns (NP-018 … NP-023). A second, untested copy of a
 * contract is worse than no copy: it reads like the truth and drifts in
 * silence. Anything that needs those shapes belongs on the native side of the
 * wire, where `@become/api-client` is a real dependency.
 */
import { z } from 'zod'

// ── The profile the server actually stores ──────────────────────────────────
//
// The allow-list in app/api/profile/route.ts (ALLOWED_PROFILE_KEYS), key for
// key. Everything is optional: a profile sub-document may hold any subset, and
// GET /api/profile answers `{}` for a member who has never onboarded.

export const UserProfileSchema = z
  .object({
    /** Primary goal. Mirrors `fitnessGoals[0]`. */
    fitnessGoal: z.string().optional(),
    /** Ordered goal set from onboarding — index 0 is the primary, up to 3. */
    fitnessGoals: z.array(z.string()).optional(),
    /** Calorie direction: 'lose' | 'maintain' | 'gain'. */
    nutritionDirection: z.string().optional(),
    /** 'beginner' | 'intermediate' | 'advanced'. */
    experienceLevel: z.string().optional(),
    age: z.number().optional(),
    biologicalSex: z.string().optional(),
    heightCm: z.number().optional(),
    currentWeightKg: z.number().optional(),
    targetWeightKg: z.number().optional(),
    equipmentAccess: z.array(z.string()).optional(),
    injuryNotes: z.string().optional(),
    weeklyAvailability: z.number().optional(),
    weightUnit: z.string().optional(),
    planPromoteMode: z.string().optional(),
  })
  .passthrough()

// ── GET /api/auth/me ────────────────────────────────────────────────────────

/** Billing state, as GET /api/auth/me projects it. Deliberately partial: the
 *  route selects only the three fields a client renders. */
export const UserSubscriptionSchema = z
  .object({
    status: z.string().optional(),
    currentPeriodEnd: z.string().nullish(),
    cancelAtPeriodEnd: z.boolean().optional(),
  })
  .passthrough()

const UserSavedProgramSchema = z
  .object({
    programId: z.string(),
    savedAt: z.union([z.string(), z.date()]).optional(),
    order: z.number().optional(),
  })
  .passthrough()

export type UserSavedProgram = z.infer<typeof UserSavedProgramSchema>

export const UserSchema = z
  .object({
    _id: z.string(),
    email: z.string().email(),
    name: z.string().optional().nullable(),
    role: z.string().optional(),
    /** 'free' | 'plus'. Optional because legacy rows may not carry it. */
    tier: z.string().optional(),
    grandfathered: z.boolean().optional(),
    subscription: UserSubscriptionSchema.optional().nullable(),
    trainerId: z.string().optional().nullable(),
    savedPrograms: z
      .array(z.union([z.string(), UserSavedProgramSchema]))
      .optional()
      .nullable(),
    profile: UserProfileSchema.optional().nullable(),
    onboardingCompleted: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough()

// Passthrough on the envelope too: the route may grow a sibling of `token`
// (it already grew `tier`/`grandfathered` inside `user`), and a store build
// that is months old must keep whatever it is sent rather than drop it.
export const MeResponseSchema = z
  .object({
    user: UserSchema,
    token: z.string().optional(),
  })
  .passthrough()

export type UserProfile = z.infer<typeof UserProfileSchema>
export type UserSubscription = z.infer<typeof UserSubscriptionSchema>
export type User = z.infer<typeof UserSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>
