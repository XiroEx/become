'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flame,
  Dumbbell,
  Scale,
  Zap,
  Heart,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  Pencil,
  TrendingDown,
  Minus,
  TrendingUp,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import MacroExplainSheet from '@/components/nutrition/MacroExplainSheet'
import PacePicker from '@/components/goals/PacePicker'
import { defaultPaceKg, directionFromWeights, kgToUnit as goalKgToUnit } from '@/lib/goals/pace'
import {
  explainCalories,
  explainMacro,
  proteinNeedsFlag,
  MACRO_LABELS,
  type MacroKey,
} from '@/lib/nutrition/macroExplain'
import { defaultIconForGoal } from '@/lib/reward/icons'
import {
  computeNutritionTargets,
  directionForGoal,
  activityFromTrainingDays,
  waterGoalOz,
  DIRECTION_EXPLANATION,
  ACTIVITY_LABELS,
  ACTIVITY_MULTIPLIERS,
  MACRO_PRESET_LABELS,
  MACRO_PRESET_BLURBS,
  splitForPreset,
  recommendPreset,
  calorieAdjustment,
  type NutritionDirection,
  type ActivityLevel,
  type MacroPreset,
} from '@/lib/nutrition/tdee'
import type { FitnessGoal, ExperienceLevel, EquipmentType } from '@/lib/programMatch'
import {
  lbsToKg,
  ftInToCm,
  cmToFtIn,
  displayWeight,
  roundWeight,
  roundHeightCm,
} from '@/lib/bodyUnits'

// ── Types ─────────────────────────────────────────────────────────────────────

type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say'

interface ProfileData {
  /** Ordered — index 0 is the primary goal. */
  fitnessGoals?: FitnessGoal[]
  nutritionDirection?: NutritionDirection
  experienceLevel?: ExperienceLevel
  age?: number
  biologicalSex?: BiologicalSex
  heightCm?: number
  currentWeightKg?: number
  targetWeightKg?: number
  /** Chosen pace toward the target (kg/week). Lives on the Goal, not the profile;
   *  posted to /api/goals right after the profile is saved. */
  paceKgPerWeek?: number
  equipmentAccess?: EquipmentType[]
  injuryNotes?: string
  weeklyAvailability?: number
  /** Asked DIRECTLY rather than inferred from training days. Training frequency
   *  is not the same thing as daily activity — a labourer and a desk worker who
   *  both lift 3x/week have very different TDEEs, and this multiplier swings the
   *  calorie target by ~600 cal, so it is the least safe thing to guess. */
  activityLevel?: ActivityLevel
  /** Which macro split the member chose. */
  macroPreset?: MacroPreset
  /** The unit the user actually typed in. Profile weights are always stored in
   *  kg, but the weight LOG is stored raw in the user's display unit — so we
   *  have to carry this through to seed the first log entry correctly. */
  weightUnit?: 'lbs' | 'kg'
}

interface Recommendation {
  program_id: string
  name: string
  description: string
  target_user: string
  training_days_per_week: number | null
  duration_weeks: number | null
  reasons: string[]
}

// ── Step configuration ────────────────────────────────────────────────────────

const GOAL_OPTIONS: { value: FitnessGoal; label: string; Icon: typeof Flame; color: string; bg: string }[] = [
  { value: 'lose_weight',          label: 'Lose Weight',          Icon: Flame,    color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  { value: 'gain_muscle',          label: 'Build Muscle',         Icon: Dumbbell, color: 'text-blue-500',   bg: 'bg-blue-100 dark:bg-blue-900/30'   },
  { value: 'maintain',             label: 'Maintain & Tone',      Icon: Scale,    color: 'text-violet-500', bg: 'bg-violet-100 dark:bg-violet-900/30' },
  { value: 'improve_performance',  label: 'Improve Performance',  Icon: Zap,      color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { value: 'general_health',       label: 'General Health',       Icon: Heart,    color: 'text-emerald-500',bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
]

const GOAL_LABEL: Record<FitnessGoal, string> = GOAL_OPTIONS.reduce(
  (acc, g) => ({ ...acc, [g.value]: g.label }),
  {} as Record<FitnessGoal, string>
)

const MAX_GOALS = 3

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; desc: string }[] = [
  { value: 'beginner',     label: 'Beginner',     desc: 'New to structured training' },
  { value: 'intermediate', label: 'Intermediate', desc: '1-3 years of consistent training' },
  { value: 'advanced',     label: 'Advanced',     desc: '3+ years, familiar with programming' },
]

const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'male',              label: 'Male' },
  { value: 'female',            label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const EQUIPMENT_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: 'none',      label: 'None' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbell',   label: 'Barbell' },
  { value: 'cables',    label: 'Cables' },
  { value: 'full_gym',  label: 'Full Gym' },
]

const DIRECTION_OPTIONS: { value: NutritionDirection; label: string; sub: string; Icon: typeof Flame }[] = [
  { value: 'lose',     label: 'Lose Weight', sub: 'TDEE − 500', Icon: TrendingDown },
  { value: 'maintain', label: 'Maintain',    sub: 'TDEE',       Icon: Minus },
  { value: 'gain',     label: 'Gain Weight', sub: 'TDEE + 300', Icon: TrendingUp },
]

const TOTAL_STEPS = 5

const STEP_TITLES = ['Goals', 'Background', 'Body & nutrition', 'Equipment', 'Review'] as const

/** Plain-English activity descriptions — the multiplier alone means nothing to a member. */
const ACTIVITY_BLURBS: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, mostly sitting, little walking',
  light: 'On your feet some of the day, light walking',
  moderate: 'Moving a good part of the day',
  active: 'On your feet most of the day, or a physical job',
  very_active: 'Hard physical work all day',
}

/** 'custom' is a Nutrition-tab concept; onboarding offers the four real splits. */
const MACRO_PRESET_CHOICES: MacroPreset[] = ['recommended', 'balanced', 'high_protein', 'low_carb']

// ── Animation variants ────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
}

// ── Live program recommendation ───────────────────────────────────────────────

/**
 * Asks the API for the best-matching program as the member answers. Runs on
 * every meaningful answer change (debounced) so the goal step can show a real
 * recommendation the moment goals are picked — which is the whole point of
 * making these choices matter.
 */
function useRecommendation(profile: ProfileData, enabled: boolean) {
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  const goals = profile.fitnessGoals ?? []
  const key = [
    goals.join(','),
    profile.experienceLevel ?? '',
    profile.weeklyAvailability ?? '',
    (profile.equipmentAccess ?? []).join(','),
  ].join('|')

  useEffect(() => {
    if (!enabled || goals.length === 0) {
      setRec(null)
      return
    }

    const id = ++requestId.current
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        // profile=0 — rank on THIS session's answers only. Without it a member
        // redoing onboarding gets ranked against the equipment/experience
        // they're currently in the middle of replacing.
        const params = new URLSearchParams({ goals: goals.join(','), limit: '1', profile: '0' })
        if (profile.experienceLevel) params.set('level', profile.experienceLevel)
        if (profile.weeklyAvailability) params.set('days', String(profile.weeklyAvailability))
        if (profile.equipmentAccess?.length) params.set('equipment', profile.equipmentAccess.join(','))

        const res = await fetch(`/api/programs/recommend?${params}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        // Ignore responses from superseded requests.
        if (id !== requestId.current) return
        setRec(data.recommendations?.[0] ?? null)
      } catch {
        if (id === requestId.current) setRec(null)
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  return { rec, loading }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [profile, setProfile] = useState<ProfileData>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  /** Once the member picks a calorie direction themselves we stop re-deriving
   *  it from the primary goal — their explicit choice wins. */
  const [directionTouched, setDirectionTouched] = useState(false)

  const goals = useMemo(() => profile.fitnessGoals ?? [], [profile.fitnessGoals])
  const primaryGoal = goals[0]
  const effectiveDirection: NutritionDirection =
    profile.nutritionDirection ?? directionForGoal(primaryGoal)

  const { rec, loading: recLoading } = useRecommendation(profile, authChecked)
  // Optional enrolment straight from the recommendation. Onboarding used to end
  // with a program match the member could not act on, and a dashboard that then
  // said "No program yet".
  const [enrolling, setEnrolling] = useState(false)
  const [enrolled, setEnrolled] = useState(false)

  const enrolInRecommended = useCallback(async () => {
    if (!rec || enrolling || enrolled) return
    setEnrolling(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/programs/enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ programId: rec.program_id }),
      })
      // A failure here must never block finishing onboarding — enrolling is a
      // bonus, not a step.
      if (res.ok) setEnrolled(true)
    } catch {
      /* stay un-enrolled; they can start it from the dashboard */
    } finally {
      setEnrolling(false)
    }
  }, [rec, enrolling, enrolled])

  // Mifflin-St Jeor needs all four. Without them computeNutritionTargets()
  // returns null, no goal document is seeded, and the member silently inherits
  // the schema defaults (2000/150/200/65) that describe nobody. So step 3 cannot
  // be passed until we can actually compute an honest number.
  const canComputeTargets = Boolean(
    profile.currentWeightKg &&
    profile.heightCm &&
    profile.age &&
    profile.biologicalSex,
  )

  const targets = useMemo(
    () =>
      computeNutritionTargets({
        currentWeightKg: profile.currentWeightKg,
        heightCm: profile.heightCm,
        age: profile.age,
        biologicalSex: profile.biologicalSex,
        goals,
        direction: effectiveDirection,
        weeklyAvailability: profile.weeklyAvailability,
        activityLevel: profile.activityLevel,
        macroPreset: profile.macroPreset,
        paceKgPerWeek: profile.paceKgPerWeek ?? defaultPaceKg(effectiveDirection),
      }),
    [profile.currentWeightKg, profile.heightCm, profile.age, profile.biologicalSex, goals, effectiveDirection, profile.weeklyAvailability, profile.activityLevel, profile.macroPreset, profile.paceKgPerWeek]
  )


  // ── Auth check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const token = getToken()
      if (!token) {
        router.replace('/login')
        return
      }

      // Validate expiry
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (Date.now() >= payload.exp * 1000) {
          localStorage.removeItem('token')
          router.replace('/login')
          return
        }
      } catch {
        localStorage.removeItem('token')
        router.replace('/login')
        return
      }

      // Check if already onboarded
      try {
        const res = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.onboardingCompleted) {
            router.replace('/dashboard')
            return
          }
        }
      } catch {
        // If profile fetch fails, still show onboarding
      }

      setAuthChecked(true)
    }

    checkAuth()
  }, [router])

  // ── Navigation helpers ───────────────────────────────────────────────────
  function goNext() {
    setDirection(1)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  function goBack() {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 1))
  }

  function goToStep(target: number) {
    setDirection(target > step ? 1 : -1)
    setStep(Math.min(Math.max(target, 1), TOTAL_STEPS))
  }

  // ── Goal selection (multi, ordered) ──────────────────────────────────────
  function toggleGoal(goal: FitnessGoal) {
    setProfile((p) => {
      const current = p.fitnessGoals ?? []
      let next: FitnessGoal[]
      if (current.includes(goal)) {
        next = current.filter((g) => g !== goal)
      } else if (current.length >= MAX_GOALS) {
        // At the cap — replace the least important pick rather than silently
        // ignoring the tap.
        next = [...current.slice(0, MAX_GOALS - 1), goal]
      } else {
        next = [...current, goal]
      }
      // Keep the calorie direction in step with the primary goal until the
      // member overrides it themselves.
      const nutritionDirection = directionTouched
        ? p.nutritionDirection
        : directionForGoal(next[0])
      return { ...p, fitnessGoals: next, nutritionDirection }
    })
  }

  function setDirectionChoice(d: NutritionDirection) {
    setDirectionTouched(true)
    setProfile((p) => ({ ...p, nutritionDirection: d }))
  }

  /** Step 3's onChange. Body stats and weights flow straight into the profile,
   *  but a change to either weight also re-derives the calorie direction from
   *  them — target weight is the intent; direction is read off it, not
   *  collected a second time. Only while the member hasn't picked a direction
   *  explicitly (setDirectionChoice), same as the goal-based default it replaces. */
  const handleStep3Change = useCallback((updates: Partial<ProfileData>) => {
    setProfile((p) => {
      const next = { ...p, ...updates }
      if (!directionTouched && ('currentWeightKg' in updates || 'targetWeightKg' in updates)) {
        next.nutritionDirection =
          directionFromWeights(next.currentWeightKg, next.targetWeightKg) ??
          directionForGoal(next.fitnessGoals?.[0])
      }
      return next
    })
  }, [directionTouched])

  // ── Submit (finish) ───────────────────────────────────────────────────────
  async function submit() {
    setIsSubmitting(true)
    const token = getToken()
    const payload = profile
    const payloadGoals = payload.fitnessGoals ?? []
    const payloadDirection = payload.nutritionDirection ?? directionForGoal(payloadGoals[0])

    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          profile: {
            ...Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'paceKgPerWeek')),
            // fitnessGoal stays the single primary goal — the dashboard, nudge
            // modal, profile icon and AI context all read that one field.
            fitnessGoal: payloadGoals[0],
            fitnessGoals: payloadGoals,
            nutritionDirection: payloadDirection,
            // The imperial/metric toggle defaults to lbs, so an untouched toggle
            // must still persist 'lbs' rather than leaving weightUnit unset.
            weightUnit: payload.weightUnit ?? 'lbs',
          },
          onboardingCompleted: true,
          // Give every new user a starter profile icon matched to their goal.
          profileIcon: defaultIconForGoal(payloadGoals[0]),
        }),
      })

      // Seed the first weight log entry from the body stats step.
      //
      // The PROFILE stores weight in kg, but the weight LOG stores a raw number
      // in the user's display unit (WeightModal is literally labelled "Weight
      // (lbs)" and posts what you typed). Seeding it with the kg value meant a
      // user who entered 175 lb got a first log entry of 79 — which then showed
      // up as "79 lbs" on the dashboard/progress chart until they logged again.
      const seeds: Promise<unknown>[] = []

      // The chosen pace lives on the dated Goal (lib/goals), created from the
      // profile we just saved. Default by direction if the member never touched
      // the chips.
      if (payload.targetWeightKg && payloadDirection !== 'maintain') {
        seeds.push(
          fetch('/api/goals', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pillar: 'nutrition', paceKgPerWeek: payload.paceKgPerWeek ?? defaultPaceKg(payloadDirection), tz: new Date().getTimezoneOffset() }),
          }).catch(() => {})
        )
      }

      if (payload.currentWeightKg) {
        const unit = payload.weightUnit ?? 'lbs'
        const seedWeight = displayWeight(payload.currentWeightKg, unit)
        seeds.push(
          fetch('/api/weight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ weight: seedWeight, tz: new Date().getTimezoneOffset() }),
          }).catch(() => {})
        )
      }

      // Seed TDEE-based nutrition goals if we have enough data.
      //
      // goalType MUST be the NutritionGoal enum ('lose' | 'maintain' | 'gain').
      // This used to post the raw fitnessGoal ('lose_weight', 'gain_muscle', …),
      // which failed schema validation on the upsert — so the goal doc was
      // never created and every new member saw the hardcoded 2000/150/200/65
      // defaults until they opened the goals page and hit Save.
      const seedTargets = computeNutritionTargets({
        currentWeightKg: payload.currentWeightKg,
        heightCm: payload.heightCm,
        age: payload.age,
        biologicalSex: payload.biologicalSex,
        goals: payloadGoals,
        direction: payloadDirection,
        weeklyAvailability: payload.weeklyAvailability,
        activityLevel: payload.activityLevel,
        macroPreset: payload.macroPreset,
        paceKgPerWeek: payload.paceKgPerWeek ?? defaultPaceKg(payloadDirection),
      })
      if (seedTargets) {
        seeds.push(
          fetch('/api/nutrition/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              calories: seedTargets.calories,
              protein: seedTargets.protein,
              carbs: seedTargets.carbs,
              fats: seedTargets.fats,
              waterGoal: waterGoalOz(payload.currentWeightKg),
              goalType: seedTargets.direction,
              activityLevel: seedTargets.activityLevel,
              macroPreset: payload.macroPreset ?? 'recommended',
            }),
          }).catch(() => {})
        )
      }

      // Await the seeds — the dashboard reads weight and nutrition goals on
      // mount, so navigating before they land showed stale/default numbers.
      await Promise.all(seeds)

      // Reset program nudge so dashboard shows it immediately for new users
      try { localStorage.removeItem('become_program_nudge') } catch {}
    } catch {
      // Still navigate on error — don't block the user
    } finally {
      router.push('/dashboard')
    }
  }

  // ── Loading / auth gate ──────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
      </div>
    )
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-20 h-1 bg-zinc-200 dark:bg-zinc-800">
        <motion.div
          className="h-full bg-zinc-900 dark:bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center px-4 pt-10 pb-32 sm:px-6">
        {/* Step counter */}
        <p
          data-testid="onboarding-step-counter"
          className="mt-4 text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500"
        >
          Step {step} of {TOTAL_STEPS} · {STEP_TITLES[step - 1]}
        </p>

        {/* Animated step content */}
        <div className="relative mt-6 w-full max-w-lg overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {step === 1 && (
                <Step1
                  goals={goals}
                  onToggle={toggleGoal}
                  rec={rec}
                  recLoading={recLoading}
                />
              )}
              {step === 2 && (
                <Step2
                  experienceLevel={profile.experienceLevel}
                  weeklyAvailability={profile.weeklyAvailability}
                  onExperienceChange={(v) => setProfile((p) => ({ ...p, experienceLevel: v }))}
                  onAvailabilityChange={(v) => setProfile((p) => ({ ...p, weeklyAvailability: v }))}
                />
              )}
              {step === 3 && (
                <Step3
                  profile={profile}
                  direction={effectiveDirection}
                  targets={targets}
                  goals={goals}
                  onChange={handleStep3Change}
                  onDirectionChange={setDirectionChoice}
                />
              )}
              {step === 4 && (
                <Step4
                  equipmentAccess={profile.equipmentAccess ?? []}
                  injuryNotes={profile.injuryNotes ?? ''}
                  onEquipmentChange={(v) => setProfile((p) => ({ ...p, equipmentAccess: v }))}
                  onInjuryNotesChange={(v) => setProfile((p) => ({ ...p, injuryNotes: v }))}
                />
              )}
              {step === 5 && (
                <Step5Review
                  profile={profile}
                  goals={goals}
                  direction={effectiveDirection}
                  targets={targets}
                  rec={rec}
                  onEdit={goToStep}
                  enrolled={enrolled}
                  enrolling={enrolling}
                  onEnroll={enrolInRecommended}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Fixed bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-200 bg-zinc-50/95 px-4 py-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          {/* Back */}
          <button
            onClick={goBack}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {/* Next / Finish */}
          {step < TOTAL_STEPS ? (
            <button
              onClick={goNext}
              data-testid="onboarding-next"
              disabled={(step === 1 && goals.length === 0) || (step === 3 && !canComputeTargets)}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:pointer-events-none disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => submit()}
              data-testid="onboarding-finish"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {isSubmitting ? 'Saving...' : 'Finish'}
              {!isSubmitting && <Check className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Recommendation card ───────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  loading,
  compact,
  enrolled,
  enrolling,
  onEnroll,
}: {
  rec: Recommendation | null
  loading: boolean
  compact?: boolean
  /** Already enrolled in this program during onboarding. */
  enrolled?: boolean
  enrolling?: boolean
  /** Omit to render the card as pure information (no action). */
  onEnroll?: () => void
}) {
  if (loading && !rec) {
    return (
      <div className="mt-6 animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-3 h-4 w-52 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-2 h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    )
  }

  if (!rec) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      data-testid="recommended-program"
      className={`rounded-2xl border-2 border-zinc-900 bg-white p-4 dark:border-white dark:bg-zinc-900 ${compact ? 'mt-3' : 'mt-6'}`}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-zinc-900 dark:text-white" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-900 dark:text-white">
          Recommended for you
        </p>
      </div>

      <p
        data-testid="recommended-program-name"
        className="mt-2 text-base font-bold leading-snug text-zinc-900 dark:text-white"
      >
        {rec.name}
      </p>

      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {[
          rec.duration_weeks ? `${rec.duration_weeks} weeks` : null,
          rec.training_days_per_week ? `${rec.training_days_per_week} days/week` : null,
          rec.target_user || null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {rec.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="recommended-program-reasons">
          {rec.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Offer it — never force it. The card used to be read-only, so the one
          moment a member is most bought in ended with nothing to press and the
          dashboard afterwards said "No program yet". Enrolling stays optional —
          this button simply is not shown once they've enrolled — even though
          finishing the wizard itself is now mandatory. */}
      {onEnroll && (
        enrolled ? (
          <p
            data-testid="recommended-program-enrolled"
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            <Check className="h-3.5 w-3.5" />
            Added — it will be waiting on your dashboard.
          </p>
        ) : (
          <button
            type="button"
            onClick={onEnroll}
            disabled={enrolling}
            data-testid="recommended-program-enroll"
            className="mt-3 w-full rounded-xl bg-zinc-900 py-2.5 text-xs font-bold text-white transition-transform active:scale-95 disabled:opacity-60 dark:bg-white dark:text-black"
          >
            {enrolling ? 'Adding…' : 'Start this program'}
          </button>
        )
      )}
    </motion.div>
  )
}

// ── Step 1 — Primary + secondary goals ────────────────────────────────────────

function Step1({
  goals,
  onToggle,
  rec,
  recLoading,
}: {
  goals: FitnessGoal[]
  onToggle: (v: FitnessGoal) => void
  rec: Recommendation | null
  recLoading: boolean
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
        What are you here to do?
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Pick up to {MAX_GOALS}. Your first pick is your <span className="font-semibold text-zinc-700 dark:text-zinc-200">primary goal</span> — it
        drives your program, your calories and your dashboard.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GOAL_OPTIONS.map(({ value: v, label, Icon, color, bg }) => {
          const rank = goals.indexOf(v)
          const selected = rank >= 0
          return (
            <button
              key={v}
              onClick={() => onToggle(v)}
              data-testid={`goal-${v}`}
              aria-pressed={selected}
              className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-150 ${
                selected
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
              }`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  selected ? 'bg-white/20 dark:bg-black/20' : bg
                }`}
              >
                <Icon className={`h-6 w-6 ${selected ? 'text-white dark:text-black' : color}`} />
              </div>
              <div className="min-w-0">
                <span className="font-semibold">{label}</span>
                {selected && (
                  <p
                    data-testid={rank === 0 ? 'primary-goal-badge' : undefined}
                    className="mt-0.5 text-[10px] font-bold uppercase tracking-widest opacity-70"
                  >
                    {rank === 0 ? 'Primary' : `Also #${rank + 1}`}
                  </p>
                )}
              </div>
              {selected && (
                <Check className="ml-auto h-5 w-5 shrink-0 text-white dark:text-black" />
              )}
            </button>
          )
        })}
      </div>

      {goals.length >= MAX_GOALS && (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          That&apos;s {MAX_GOALS} — tapping another swaps out your last pick.
        </p>
      )}

      <RecommendationCard rec={rec} loading={recLoading} />
    </div>
  )
}

// ── Step 2 — Background ───────────────────────────────────────────────────────

function Step2({
  experienceLevel,
  weeklyAvailability,
  onExperienceChange,
  onAvailabilityChange,
}: {
  experienceLevel?: ExperienceLevel
  weeklyAvailability?: number
  onExperienceChange: (v: ExperienceLevel) => void
  onAvailabilityChange: (v: number) => void
}) {
  const days = weeklyAvailability ?? 3

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
        Your background
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        This sets the difficulty of the program we match you with, and how active
        we assume you are when we work out your calories.
      </p>

      {/* Experience level */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Experience level
        </label>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EXPERIENCE_OPTIONS.map(({ value, label, desc }) => {
            const selected = experienceLevel === value
            return (
              <button
                key={value}
                onClick={() => onExperienceChange(value)}
                data-testid={`experience-${value}`}
                className={`rounded-xl border-2 p-4 text-left transition-all duration-150 ${
                  selected
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
                }`}
              >
                <p className="font-semibold">{label}</p>
                <p className={`mt-0.5 text-xs ${selected ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {desc}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Days per week stepper */}
      <div className="mt-8">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Days available per week
        </label>
        <div className="mt-3 flex items-center gap-5">
          <button
            onClick={() => onAvailabilityChange(Math.max(1, days - 1))}
            disabled={days <= 1}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg font-bold text-zinc-700 transition-colors hover:border-zinc-300 disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            aria-label="Decrease days"
          >
            −
          </button>
          <span
            data-testid="weekly-availability"
            className="w-8 text-center text-2xl font-bold text-zinc-900 dark:text-white"
          >
            {days}
          </span>
          <button
            onClick={() => onAvailabilityChange(Math.min(7, days + 1))}
            disabled={days >= 7}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg font-bold text-zinc-700 transition-colors hover:border-zinc-300 disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            aria-label="Increase days"
          >
            +
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">days / week</span>
        </div>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          We&apos;ll only recommend programs that fit inside {days} day{days === 1 ? '' : 's'} a week.
        </p>
      </div>
    </div>
  )
}

// ── Unit conversion ───────────────────────────────────────────────────────────
// Conversions come from lib/bodyUnits so onboarding, settings and the nutrition
// goals page can never disagree about what 210 lb is in kg. Stored values are
// exact; rounding happens at render time only (displayWeight / roundHeightCm).

// ── Step 3 — Body stats + calorie direction ───────────────────────────────────

function Step3({
  profile,
  direction,
  targets,
  goals,
  onChange,
  onDirectionChange,
}: {
  profile: ProfileData
  direction: NutritionDirection
  targets: ReturnType<typeof computeNutritionTargets>
  goals: FitnessGoal[]
  onChange: (updates: Partial<ProfileData>) => void
  onDirectionChange: (d: NutritionDirection) => void
}) {
  // Activity defaults from training days so the form arrives pre-filled with a
  // sensible answer, but the member's explicit pick always wins.
  const activity = profile.activityLevel ?? activityFromTrainingDays(profile.weeklyAvailability)
  const macroPreset = profile.macroPreset ?? 'recommended'
  // Which option gets the badge — and why — depends on goal AND experience.
  // A beginner is pointed at Balanced even when the custom split is the more
  // "correct" answer, because an accurate target they can't hit is worse than a
  // slightly softer one they can.
  const recommendation = recommendPreset(direction, goals, profile.experienceLevel)
  const suggestedPreset = recommendation.preset
  // Feeds the personalised "Recommended" split. Until the body stats and the
  // calorie target exist there is nothing to personalise from, so the cards fall
  // back to the static per-direction table.
  const presetContext = targets && profile.currentWeightKg
    ? { weightLbs: profile.currentWeightKg * 2.2046226218, calories: targets.calories, goals }
    : undefined
  // What the target weight alone implies, so the direction buttons below can
  // be checked against it instead of just accepting whatever's picked. Shown
  // regardless of direction — a member coming from "Maintain" who then types a
  // target is exactly the case the field used to hide from.
  const derivedDirection = directionFromWeights(profile.currentWeightKg, profile.targetWeightKg)
  const directionMismatch = derivedDirection != null && derivedDirection !== direction

  const [useImperial, setUseImperial] = useState(true)

  // Which figure the member tapped, if any.
  const [explaining, setExplaining] = useState<MacroKey | 'calories' | null>(null)

  const proteinFlagged = useMemo(
    () =>
      !!targets &&
      proteinNeedsFlag(targets.protein, profile.currentWeightKg, targets.direction, goals),
    [targets, profile.currentWeightKg, goals],
  )

  /** The sheet's contents, rebuilt from the SAME targets the card is showing. */
  const explanation = useMemo(() => {
    if (!explaining || !targets) return null
    if (explaining === 'calories') {
      const c = explainCalories(
        {
          currentWeightKg: profile.currentWeightKg,
          heightCm: profile.heightCm,
          age: profile.age,
          biologicalSex: profile.biologicalSex,
        },
        targets.activityLevel,
        targets.direction,
        profile.paceKgPerWeek ?? defaultPaceKg(targets.direction),
      )
      if (!c) return null
      return {
        title: 'Where your calories come from',
        headline: `${c.calories.toLocaleString()} cal / day`,
        steps: c.steps,
        note: undefined,
      }
    }
    const m = explainMacro({
      macro: explaining,
      grams: targets[explaining],
      calories: targets.calories,
      percent: targets.split[explaining],
      weightKg: profile.currentWeightKg,
      direction: targets.direction,
      goals,
      presetLabel: MACRO_PRESET_LABELS[profile.macroPreset ?? 'recommended'],
    })
    return {
      title: `Where your ${MACRO_LABELS[explaining].toLowerCase()} comes from`,
      headline: `${m.grams} g${m.perLb ? ` · ${m.perLb} g per lb` : ''}`,
      steps: m.steps,
      note: m.note,
    }
  }, [explaining, targets, profile.currentWeightKg, profile.heightCm, profile.age, profile.biologicalSex, profile.macroPreset, profile.paceKgPerWeek, goals])

  // Imperial display state
  const initialHeight = profile.heightCm ? cmToFtIn(profile.heightCm) : { ft: '', inches: '' }
  const [heightFt, setHeightFt] = useState<string>(initialHeight.ft !== '' ? String(initialHeight.ft) : '')
  const [heightIn, setHeightIn] = useState<string>(initialHeight.inches !== '' ? String(initialHeight.inches) : '')
  const [currentLbs, setCurrentLbs] = useState<string>(
    profile.currentWeightKg ? String(displayWeight(profile.currentWeightKg, 'lbs')) : ''
  )
  const [targetLbs, setTargetLbs] = useState<string>(
    profile.targetWeightKg ? String(displayWeight(profile.targetWeightKg, 'lbs')) : ''
  )

  // Metric display state
  const [heightCmDisplay, setHeightCmDisplay] = useState<string>(
    profile.heightCm ? String(roundHeightCm(profile.heightCm)) : ''
  )
  const [currentKgDisplay, setCurrentKgDisplay] = useState<string>(
    profile.currentWeightKg ? String(roundWeight(profile.currentWeightKg)) : ''
  )
  const [targetKgDisplay, setTargetKgDisplay] = useState<string>(
    profile.targetWeightKg ? String(roundWeight(profile.targetWeightKg)) : ''
  )

  function switchUnits(toImperial: boolean) {
    if (toImperial) {
      // Sync metric → imperial display
      if (profile.heightCm) {
        const { ft, inches } = cmToFtIn(profile.heightCm)
        setHeightFt(String(ft))
        setHeightIn(String(inches))
      }
      if (profile.currentWeightKg) setCurrentLbs(String(displayWeight(profile.currentWeightKg, 'lbs')))
      if (profile.targetWeightKg) setTargetLbs(String(displayWeight(profile.targetWeightKg, 'lbs')))
    } else {
      // Sync imperial → metric display
      if (profile.heightCm) setHeightCmDisplay(String(roundHeightCm(profile.heightCm)))
      if (profile.currentWeightKg) setCurrentKgDisplay(String(roundWeight(profile.currentWeightKg)))
      if (profile.targetWeightKg) setTargetKgDisplay(String(roundWeight(profile.targetWeightKg)))
    }
    setUseImperial(toImperial)
    // Persist the choice — the profile keeps weights in kg, but the weight LOG
    // and every weight readout use this unit. Without it the toggle was purely
    // local and a kg user's weights were later rendered as lbs.
    onChange({ weightUnit: toImperial ? 'lbs' : 'kg' })
  }

  function handleHeightChange(ft: string, inches: string) {
    setHeightFt(ft); setHeightIn(inches)
    const ftNum = parseInt(ft) || 0
    const inNum = parseInt(inches) || 0
    onChange({ heightCm: (ftNum > 0 || inNum > 0) ? ftInToCm(ftNum, inNum) : undefined })
  }

  function handleHeightCmChange(cm: string) {
    setHeightCmDisplay(cm)
    onChange({ heightCm: cm ? Number(cm) : undefined })
  }

  function handleCurrentWeightChange(val: string) {
    if (useImperial) {
      setCurrentLbs(val)
      onChange({ currentWeightKg: val ? lbsToKg(Number(val)) : undefined })
    } else {
      setCurrentKgDisplay(val)
      onChange({ currentWeightKg: val ? Number(val) : undefined })
    }
  }

  function handleTargetWeightChange(val: string) {
    if (useImperial) {
      setTargetLbs(val)
      onChange({ targetWeightKg: val ? lbsToKg(Number(val)) : undefined })
    } else {
      setTargetKgDisplay(val)
      onChange({ targetWeightKg: val ? Number(val) : undefined })
    }
  }

  const inputCls = "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white"

  // What's still missing before we can compute an honest TDEE.
  const missing = [
    !profile.age && 'age',
    !profile.heightCm && 'height',
    !profile.currentWeightKg && 'weight',
    (!profile.biologicalSex || profile.biologicalSex === 'prefer_not_to_say') && 'biological sex',
  ].filter(Boolean) as string[]

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
            Body stats
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            These four numbers are what your daily calories and macros are built
            from. Nothing here is shared.
          </p>
        </div>
        {/* Unit toggle */}
        <div className="mt-1 flex shrink-0 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
          <button
            onClick={() => switchUnits(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              useImperial
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Imperial
          </button>
          <button
            onClick={() => switchUnits(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              !useImperial
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Metric
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {/* Age + Height */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Age</label>
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={100}
              placeholder="e.g. 28"
              data-testid="stat-age"
              value={profile.age ?? ''}
              onChange={(e) => onChange({ age: e.target.value ? Number(e.target.value) : undefined })}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Height</label>
            {useImperial ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input type="number" inputMode="numeric" min={3} max={8} placeholder="5"
                    data-testid="stat-height-ft"
                    value={heightFt} onChange={(e) => handleHeightChange(e.target.value, heightIn)}
                    className={inputCls} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">ft</span>
                </div>
                <div className="relative flex-1">
                  <input type="number" inputMode="numeric" min={0} max={11} placeholder="10"
                    data-testid="stat-height-in"
                    value={heightIn} onChange={(e) => handleHeightChange(heightFt, e.target.value)}
                    className={inputCls} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">in</span>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input type="number" inputMode="numeric" min={100} max={250} placeholder="e.g. 175"
                  data-testid="stat-height-cm"
                  value={heightCmDisplay} onChange={(e) => handleHeightCmChange(e.target.value)}
                  className={inputCls} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">cm</span>
              </div>
            )}
          </div>
        </div>

        {/* Biological sex */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Biological sex</label>
          <div className="flex gap-2">
            {SEX_OPTIONS.map(({ value, label }) => {
              const selected = profile.biologicalSex === value
              return (
                <button key={value} onClick={() => onChange({ biologicalSex: value })}
                  data-testid={`sex-${value}`}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-xs font-semibold transition-all duration-150 ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600'
                  }`}>
                  {label}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            The Mifflin-St Jeor equation needs this. Choosing &quot;prefer not to say&quot;
            means we can&apos;t calculate your calories automatically.
          </p>
        </div>

        {/* Weight fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Current weight ({useImperial ? 'lbs' : 'kg'})
            </label>
            <div className="relative">
              <input type="number" inputMode="decimal" step={useImperial ? '1' : '0.1'} min={0}
                placeholder={useImperial ? 'e.g. 185' : 'e.g. 84'}
                data-testid="stat-current-weight"
                value={useImperial ? currentLbs : currentKgDisplay}
                onChange={(e) => handleCurrentWeightChange(e.target.value)}
                className={inputCls} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                {useImperial ? 'lbs' : 'kg'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Target weight ({useImperial ? 'lbs' : 'kg'})
            </label>
            <div className="relative">
              <input type="number" inputMode="decimal" step={useImperial ? '1' : '0.1'} min={0}
                placeholder={useImperial ? 'e.g. 165' : 'e.g. 75'}
                data-testid="stat-target-weight"
                value={useImperial ? targetLbs : targetKgDisplay}
                onChange={(e) => handleTargetWeightChange(e.target.value)}
                className={inputCls} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                {useImperial ? 'lbs' : 'kg'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Pace toward the target ─────────────────────────────────────── */}
        {profile.targetWeightKg && profile.currentWeightKg ? (
          <div className="pt-1">
            <PacePicker
              unit={useImperial ? 'lbs' : 'kg'}
              direction={direction}
              valueKgPerWeek={profile.paceKgPerWeek ?? defaultPaceKg(direction)}
              onChange={(kg) => onChange({ paceKgPerWeek: kg })}
              latestWeight={goalKgToUnit(profile.currentWeightKg, useImperial ? 'lbs' : 'kg')}
              targetWeight={goalKgToUnit(profile.targetWeightKg, useImperial ? 'lbs' : 'kg')}
            />
          </div>
        ) : null}

        {/* ── Calorie direction ─────────────────────────────────────────── */}
        <div className="pt-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Which way are you eating?
          </label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {derivedDirection
              ? 'Pre-set from your target weight — change it if you disagree.'
              : 'Pre-set from your primary goal — change it if you disagree.'}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DIRECTION_OPTIONS.map(({ value, label, sub, Icon }) => {
              const selected = direction === value
              // Show the adjustment ACTUALLY applied, not the nominal one. The
              // deficit is capped at 20% of TDEE and the surplus at 15%, so a
              // smaller member reading "TDEE - 500" gets a different number and
              // no way to reconcile it. With a live TDEE we can just say it.
              const applied = targets ? calorieAdjustment(targets.tdee, value) : null
              const subLabel = applied === null || applied === 0
                ? sub
                : `TDEE ${applied < 0 ? '−' : '+'} ${Math.abs(applied)}`
              return (
                <button
                  key={value}
                  onClick={() => onDirectionChange(value)}
                  data-testid={`direction-${value}`}
                  aria-pressed={selected}
                  className={`rounded-xl border-2 p-3 text-left transition-all duration-150 ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <p className="mt-1.5 text-xs font-semibold leading-tight">{label}</p>
                  <p className={`mt-0.5 text-[10px] ${selected ? 'opacity-70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                    {subLabel}
                  </p>
                </button>
              )
            })}
          </div>
          {directionMismatch && derivedDirection && (
            <button
              type="button"
              onClick={() => onDirectionChange(derivedDirection)}
              data-testid="direction-mismatch-warning"
              className="mt-2 flex w-full items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Your target is {derivedDirection === 'lose' ? 'below' : derivedDirection === 'gain' ? 'above' : 'close to'} your current weight
                — that usually means {DIRECTION_OPTIONS.find((o) => o.value === derivedDirection)?.label}, not {DIRECTION_OPTIONS.find((o) => o.value === direction)?.label}.{' '}
                <span className="font-semibold underline">Switch to {DIRECTION_OPTIONS.find((o) => o.value === derivedDirection)?.label}</span>
              </span>
            </button>
          )}
        </div>

        {/* ── Activity level ────────────────────────────────────────────── */}
        {/* Asked outright. It used to be inferred from weekly training days,
            which conflates "how often do you lift" with "how much do you move" —
            and it is the biggest single lever on the calorie target. */}
        <div className="pt-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            How active is your day, outside training?
          </label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Your job and daily movement, not your workouts. This has the biggest effect on your calories.
          </p>
          <div className="mt-3 space-y-2">
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => {
              const selected = activity === level
              return (
                <button
                  key={level}
                  onClick={() => onChange({ activityLevel: level })}
                  data-testid={`activity-${level}`}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-150 ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <span>
                    <span className="block text-xs font-semibold">{ACTIVITY_LABELS[level]}</span>
                    <span className={`block text-[10px] ${selected ? 'opacity-70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                      {ACTIVITY_BLURBS[level]}
                    </span>
                  </span>
                  <span className={`text-[10px] tabular-nums ${selected ? 'opacity-70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                    &times;{ACTIVITY_MULTIPLIERS[level]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Macro split ───────────────────────────────────────────────── */}
        <div className="pt-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            How do you want your macros split?
          </label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            You can change this any time in Nutrition.
          </p>
          <div className="mt-3 space-y-2">
            {MACRO_PRESET_CHOICES.map((key) => {
              const selected = macroPreset === key
              // Show the ratio this option will ACTUALLY deliver. "Recommended"
              // is personalised from their bodyweight, goal and calorie target,
              // so it no longer reads identically to "Balanced".
              const split = splitForPreset(key, direction, presetContext)
              const isSuggested = key === suggestedPreset
              return (
                <button
                  key={key}
                  onClick={() => onChange({ macroPreset: key })}
                  data-testid={`macro-preset-${key}`}
                  aria-pressed={selected}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-150 ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      {MACRO_PRESET_LABELS[key]}
                      {isSuggested && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          selected ? 'bg-white/20' : 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        }`}>
                          {recommendation.badge}
                        </span>
                      )}
                    </span>
                    <span className={`mt-0.5 block text-[10px] ${selected ? 'opacity-70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                      {MACRO_PRESET_BLURBS[key]}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[10px] tabular-nums ${selected ? 'opacity-70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                    {split.protein}/{split.carbs}/{split.fats}
                  </span>
                </button>
              )
            })}
          </div>
          {/* Say WHY that one is badged. A recommendation the member doesn't
              understand is just another option. */}
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold">{MACRO_PRESET_LABELS[recommendation.preset]}</span>
            {' — '}
            {recommendation.why}
          </p>
        </div>

        {/* ── Live TDEE preview ─────────────────────────────────────────── */}
        {!targets && (
          <p
            data-testid="targets-incomplete"
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
          >
            Add your age, height, weight and sex above and we&apos;ll calculate your real
            calorie and macro targets. Without them we can only guess, and we would rather not.
          </p>
        )}
        {targets ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            data-testid="tdee-preview"
            className="rounded-2xl border-2 border-zinc-900 bg-white p-4 dark:border-white dark:bg-zinc-900"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-zinc-900 dark:text-white" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-900 dark:text-white">
                Your daily targets
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExplaining('calories')}
              className="mt-2 flex items-baseline gap-1.5 text-left"
            >
              <span className="text-2xl font-bold text-zinc-900 dark:text-white" data-testid="preview-calories">
                {targets.calories.toLocaleString()}
              </span>
              <span className="text-sm font-normal text-zinc-500"> cal / day</span>
              <HelpCircle className="h-3.5 w-3.5 shrink-0 self-center text-zinc-400" />
            </button>
            {/* Every figure is tappable. A number you cannot interrogate reads as
                a number somebody made up. */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {([
                ['protein', targets.protein, 'Protein'],
                ['carbs', targets.carbs, 'Carbs'],
                ['fats', targets.fats, 'Fats'],
              ] as const).map(([key, grams, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setExplaining(key)}
                  data-testid={`explain-${key}`}
                  className={`rounded-lg py-2 transition-colors ${
                    key === 'protein' && proteinFlagged
                      ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30'
                      : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
                  }`}
                >
                  <p data-testid={`preview-${key}`} className="text-sm font-bold text-zinc-900 dark:text-white">
                    {grams}g
                  </p>
                  <p className="flex items-center justify-center gap-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                    {label}
                    <HelpCircle className="h-2.5 w-2.5 shrink-0" />
                  </p>
                </button>
              ))}
            </div>
            {proteinFlagged && (
              <button
                type="button"
                onClick={() => setExplaining('protein')}
                data-testid="protein-flag"
                className="mt-2 flex w-full items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-left dark:border-amber-500/40 dark:bg-amber-500/10"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                  That protein number is outside the usual range for your bodyweight. It is not a
                  mistake — tap to see how we got it.
                </span>
              </button>
            )}
            <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Your TDEE is about <span className="font-semibold text-zinc-700 dark:text-zinc-200">{targets.tdee.toLocaleString()} cal</span>.
              We applied {DIRECTION_EXPLANATION[targets.direction]}. Tap any number to see how we got it.
            </p>
            <MacroExplainSheet
              isOpen={!!explanation}
              title={explanation?.title ?? ''}
              headline={explanation?.headline ?? ''}
              steps={explanation?.steps ?? []}
              note={explanation?.note}
              onClose={() => setExplaining(null)}
            />
          </motion.div>
        ) : (
          <div
            data-testid="tdee-incomplete"
            className="rounded-2xl border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            Add your {missing.join(', ')} and we&apos;ll calculate your calories and
            macros right here — before you ever open the nutrition tab.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step 4 — Equipment & Injuries ─────────────────────────────────────────────

function Step4({
  equipmentAccess,
  injuryNotes,
  onEquipmentChange,
  onInjuryNotesChange,
}: {
  equipmentAccess: EquipmentType[]
  injuryNotes: string
  onEquipmentChange: (v: EquipmentType[]) => void
  onInjuryNotesChange: (v: string) => void
}) {
  function toggleEquipment(value: EquipmentType) {
    if (value === 'none') {
      // "None" deselects everything else
      onEquipmentChange(equipmentAccess.includes('none') ? [] : ['none'])
      return
    }
    if (value === 'full_gym') {
      // "Full Gym" selects all (store as just ['full_gym'])
      onEquipmentChange(equipmentAccess.includes('full_gym') ? [] : ['full_gym'])
      return
    }
    // Regular toggle — remove 'none' or 'full_gym' if present
    const without = equipmentAccess.filter((e) => e !== 'none' && e !== 'full_gym')
    if (without.includes(value)) {
      onEquipmentChange(without.filter((e) => e !== value))
    } else {
      onEquipmentChange([...without, value])
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
        Equipment &amp; injuries
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        We won&apos;t recommend a barbell program to someone training in a living
        room. Tell us what you actually have.
      </p>

      {/* Equipment chips */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
          Equipment access
        </label>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map(({ value, label }) => {
            const selected = equipmentAccess.includes(value)
            return (
              <button
                key={value}
                onClick={() => toggleEquipment(value)}
                data-testid={`equipment-${value}`}
                aria-pressed={selected}
                className={`rounded-full border-2 px-4 py-2 text-sm font-medium transition-all duration-150 ${
                  selected
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Injury notes */}
      <div className="mt-7">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Injury notes
        </label>
        <textarea
          rows={4}
          placeholder="Any injuries or areas to avoid? (optional)"
          data-testid="injury-notes"
          value={injuryNotes}
          onChange={(e) => onInjuryNotesChange(e.target.value)}
          className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white"
        />
      </div>
    </div>
  )
}

// ── Step 5 — Review ───────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right text-sm font-medium text-zinc-900 dark:text-white">{value}</span>
    </div>
  )
}

function ReviewSection({
  title,
  step,
  onEdit,
  children,
  why,
}: {
  title: string
  step: number
  onEdit: (s: number) => void
  children: React.ReactNode
  why?: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h2>
        <button
          onClick={() => onEdit(step)}
          data-testid={`review-edit-${step}`}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
      <div className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">{children}</div>
      {why && (
        <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
          {why}
        </p>
      )}
    </div>
  )
}

function Step5Review({
  profile,
  goals,
  direction,
  targets,
  rec,
  onEdit,
  enrolled,
  enrolling,
  onEnroll,
}: {
  profile: ProfileData
  goals: FitnessGoal[]
  direction: NutritionDirection
  targets: ReturnType<typeof computeNutritionTargets>
  rec: Recommendation | null
  onEdit: (s: number) => void
  enrolled: boolean
  enrolling: boolean
  onEnroll: () => void
}) {
  const unit = profile.weightUnit ?? 'lbs'
  const showWeight = (kg?: number) =>
    kg ? `${displayWeight(kg, unit)} ${unit}` : '—'

  const days = profile.weeklyAvailability ?? 3
  const activity = activityFromTrainingDays(profile.weeklyAvailability)

  return (
    <div data-testid="review-step">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
        Here&apos;s what we heard
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Everything below shapes what the app does for you. Edit anything that
        isn&apos;t right, then finish.
      </p>

      <div className="mt-6 space-y-3">
        {/* Goals */}
        <ReviewSection
          title="Your goals"
          step={1}
          onEdit={onEdit}
          why={
            goals.length > 1
              ? `Your primary goal (${GOAL_LABEL[goals[0]]}) drives your program match and dashboard. Your other ${
                  goals.length === 2 ? 'goal still shifts' : `${goals.length - 1} goals still shift`
                } which programs we rank highest.`
              : goals.length === 1
                ? `${GOAL_LABEL[goals[0]]} drives your program match, your calorie direction and your dashboard.`
                : undefined
          }
        >
          {goals.length === 0 ? (
            <ReviewRow label="Goals" value="Not set" />
          ) : (
            goals.map((g, i) => (
              <ReviewRow key={g} label={i === 0 ? 'Primary' : `Also #${i + 1}`} value={GOAL_LABEL[g]} />
            ))
          )}
        </ReviewSection>

        {/* Training */}
        <ReviewSection
          title="Training"
          step={2}
          onEdit={onEdit}
          why={`We treat ${days} sessions a week as "${activity.replace('_', ' ')}" when calculating your calories, and we only surface programs that fit that schedule.`}
        >
          <ReviewRow
            label="Experience"
            value={profile.experienceLevel
              ? profile.experienceLevel[0].toUpperCase() + profile.experienceLevel.slice(1)
              : 'Not set'}
          />
          <ReviewRow label="Days / week" value={String(days)} />
        </ReviewSection>

        {/* Body + nutrition */}
        <ReviewSection
          title="Body & nutrition"
          step={3}
          onEdit={onEdit}
          why={
            targets
              ? `Mifflin-St Jeor puts your TDEE at ~${targets.tdee.toLocaleString()} cal. We applied ${DIRECTION_EXPLANATION[targets.direction]}. These land in your nutrition tab the moment you finish — no setup needed.`
              : 'Add your age, height, weight and biological sex and we can calculate your calories automatically instead of using generic defaults.'
          }
        >
          <ReviewRow label="Age" value={profile.age ? String(profile.age) : '—'} />
          <ReviewRow
            label="Height"
            value={profile.heightCm
              ? unit === 'lbs'
                ? `${cmToFtIn(profile.heightCm).ft}'${cmToFtIn(profile.heightCm).inches}"`
                : `${profile.heightCm} cm`
              : '—'}
          />
          <ReviewRow label="Current weight" value={showWeight(profile.currentWeightKg)} />
          {profile.targetWeightKg != null && (
            <ReviewRow label="Target weight" value={showWeight(profile.targetWeightKg)} />
          )}
          <ReviewRow
            label="Eating"
            value={direction === 'lose' ? 'Calorie deficit' : direction === 'gain' ? 'Calorie surplus' : 'Maintenance'}
          />
          {targets && (
            <>
              <ReviewRow label="Daily calories" value={`${targets.calories.toLocaleString()} cal`} />
              <ReviewRow
                label="Macros"
                value={`${targets.protein}p / ${targets.carbs}c / ${targets.fats}f`}
              />
            </>
          )}
        </ReviewSection>

        {/* Equipment */}
        <ReviewSection
          title="Equipment & injuries"
          step={4}
          onEdit={onEdit}
          why="Programs that need gear you don't have get pushed down your recommendations, and your injury notes ride along with your coach's view of your account."
        >
          <ReviewRow
            label="Equipment"
            value={profile.equipmentAccess?.length
              ? profile.equipmentAccess
                  .map((e) => EQUIPMENT_OPTIONS.find((o) => o.value === e)?.label ?? e)
                  .join(', ')
              : 'Not set'}
          />
          <ReviewRow label="Injury notes" value={profile.injuryNotes?.trim() ? profile.injuryNotes.trim() : 'None'} />
        </ReviewSection>

        {/* Program match */}
        {rec && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Your program match</h2>
            <RecommendationCard
              rec={rec}
              loading={false}
              compact
              enrolled={enrolled}
              enrolling={enrolling}
              onEnroll={onEnroll}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Entirely optional — you can also start it later from your dashboard,
              or browse the full catalog if you&apos;d rather pick your own.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
