/**
 * Shared API response types used by both the webapp and the planned Expo
 * sibling. Mirrors the zod-inferred shapes in shared/api-client/src/schemas/
 * but inlined here so the webapp's Docker build doesn't need access to the
 * sibling shared/ directory (it lives outside the webapp build context).
 *
 * If you change a contract on either side, mirror it in both places —
 * shared/api-client/src/schemas/*.ts and here — until the build context
 * is unified.
 */
import { z } from 'zod'

// ── auth ────────────────────────────────────────────────────────────────────

export const UserProfileSchema = z
  .object({
    goal: z.string().optional(),
    trainingExperience: z.string().optional(),
    primaryFocus: z.string().optional(),
    birthYear: z.number().int().optional(),
  })
  .passthrough()

/** Billing state, as GET /api/auth/me projects it. Deliberately partial: the
 *  route selects only the three fields a client renders. */
export const UserSubscriptionSchema = z
  .object({
    status: z.string().optional(),
    currentPeriodEnd: z.string().nullish(),
    cancelAtPeriodEnd: z.boolean().optional(),
  })
  .passthrough()

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
    savedPrograms: z.array(z.string()).optional(),
    profile: UserProfileSchema.optional().nullable(),
    onboardingCompleted: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough()

export const MeResponseSchema = z.object({
  user: UserSchema,
  token: z.string().optional(),
})

export type User = z.infer<typeof UserSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>

// ── programs ────────────────────────────────────────────────────────────────

export interface ActiveProgram {
  programId: string
  startDate?: string
  currentPhase?: number
  currentDay?: string
  completedWorkouts?: number
  totalWorkouts?: number
  status?: string
  [key: string]: unknown
}

export interface ActiveProgramsResponse {
  activePrograms: ActiveProgram[]
}

// ── schedule ────────────────────────────────────────────────────────────────

export interface ScheduleSlot {
  date: string
  programId: string
  phase: number
  dayLabel: string
  workoutTitle: string
  status: 'scheduled' | 'completed' | 'missed' | 'skipped' | 'rest'
  completedAt?: string
  notes?: string
}

export interface ScheduleResponse {
  schedules: Array<{
    _id: string
    programId: string
    programName: string
    programStatus?: string
    scheduledWorkouts: ScheduleSlot[]
  }>
}

// ── mood / weight ───────────────────────────────────────────────────────────

export interface MoodEntry {
  date: string
  mood: number
}

export interface MoodHistoryResponse {
  moods: MoodEntry[]
}

export interface WeightEntry {
  date: string
  weight: number
  bodyFat?: number
}

export interface WeightHistoryResponse {
  weights: WeightEntry[]
}

// ── workouts ────────────────────────────────────────────────────────────────

export interface WorkoutLog {
  programId: string
  day: string
  phase?: number
  date: string
  completed: boolean
  duration?: number
  activeSeconds?: number
  notes?: string
  exercises?: unknown[]
}

export interface WorkoutsListResponse {
  logs: WorkoutLog[]
}
