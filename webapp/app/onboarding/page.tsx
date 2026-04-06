'use client'

import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

type FitnessGoal = 'lose_weight' | 'gain_muscle' | 'maintain' | 'improve_performance' | 'general_health'
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say'
type EquipmentType = 'none' | 'dumbbells' | 'barbell' | 'cables' | 'full_gym'

interface ProfileData {
  fitnessGoal?: FitnessGoal
  experienceLevel?: ExperienceLevel
  age?: number
  biologicalSex?: BiologicalSex
  heightCm?: number
  currentWeightKg?: number
  targetWeightKg?: number
  equipmentAccess?: EquipmentType[]
  injuryNotes?: string
  weeklyAvailability?: number
}

// ── Step configuration ────────────────────────────────────────────────────────

const GOAL_OPTIONS: { value: FitnessGoal; label: string; Icon: typeof Flame; color: string; bg: string }[] = [
  { value: 'lose_weight',          label: 'Lose Weight',          Icon: Flame,    color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  { value: 'gain_muscle',          label: 'Build Muscle',         Icon: Dumbbell, color: 'text-blue-500',   bg: 'bg-blue-100 dark:bg-blue-900/30'   },
  { value: 'maintain',             label: 'Maintain & Tone',      Icon: Scale,    color: 'text-violet-500', bg: 'bg-violet-100 dark:bg-violet-900/30' },
  { value: 'improve_performance',  label: 'Improve Performance',  Icon: Zap,      color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { value: 'general_health',       label: 'General Health',       Icon: Heart,    color: 'text-emerald-500',bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
]

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

const TOTAL_STEPS = 4

// ── Animation variants ────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [profile, setProfile] = useState<ProfileData>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

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

  // ── Submit (finish or skip) ──────────────────────────────────────────────
  async function submit(profileOverride?: ProfileData) {
    setIsSubmitting(true)
    const token = getToken()
    const payload = profileOverride ?? profile

    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profile: payload, onboardingCompleted: true }),
      })
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
        <p className="mt-4 text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Step {step} of {TOTAL_STEPS}
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
                  value={profile.fitnessGoal}
                  onChange={(v) => setProfile((p) => ({ ...p, fitnessGoal: v }))}
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
                  onChange={(updates) => setProfile((p) => ({ ...p, ...updates }))}
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

          {/* Skip */}
          <button
            onClick={() => submit(profile)}
            disabled={isSubmitting}
            className="text-xs font-medium text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Skip for now
          </button>

          {/* Next / Finish */}
          {step < TOTAL_STEPS ? (
            <button
              onClick={goNext}
              disabled={step === 1 && !profile.fitnessGoal}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:pointer-events-none disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => submit()}
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

// ── Step 1 — Primary Goal ─────────────────────────────────────────────────────

function Step1({
  value,
  onChange,
}: {
  value?: FitnessGoal
  onChange: (v: FitnessGoal) => void
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
        What&apos;s your primary goal?
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        We&apos;ll personalise your programme around what matters most to you.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GOAL_OPTIONS.map(({ value: v, label, Icon, color, bg }) => {
          const selected = value === v
          return (
            <button
              key={v}
              onClick={() => onChange(v)}
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
              <span className="font-semibold">{label}</span>
              {selected && (
                <Check className="ml-auto h-5 w-5 shrink-0 text-white dark:text-black" />
              )}
            </button>
          )
        })}
      </div>
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
        Both fields are optional — tap &quot;Skip for now&quot; if you prefer.
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-zinc-200 bg-white text-lg font-bold text-zinc-700 transition-colors hover:border-zinc-300 disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            aria-label="Decrease days"
          >
            −
          </button>
          <span className="w-8 text-center text-2xl font-bold text-zinc-900 dark:text-white">
            {days}
          </span>
          <button
            onClick={() => onAvailabilityChange(Math.min(7, days + 1))}
            disabled={days >= 7}
            className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-zinc-200 bg-white text-lg font-bold text-zinc-700 transition-colors hover:border-zinc-300 disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            aria-label="Increase days"
          >
            +
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">days / week</span>
        </div>
      </div>
    </div>
  )
}

// ── Unit conversion helpers ───────────────────────────────────────────────────

function cmToImperial(cm: number): { ft: number; inches: number } {
  const totalInches = cm / 2.54
  return { ft: Math.floor(totalInches / 12), inches: Math.round(totalInches % 12) }
}

function imperialToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * 2.54)
}

function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462)
}

function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10
}

// ── Step 3 — Body Stats ───────────────────────────────────────────────────────

function Step3({
  profile,
  onChange,
}: {
  profile: ProfileData
  onChange: (updates: Partial<ProfileData>) => void
}) {
  const showTargetWeight =
    profile.fitnessGoal === 'lose_weight' || profile.fitnessGoal === 'gain_muscle'

  // Imperial display state — derived from stored cm/kg values
  const initialHeight = profile.heightCm ? cmToImperial(profile.heightCm) : { ft: '', inches: '' }
  const [heightFt, setHeightFt] = useState<string>(initialHeight.ft !== '' ? String(initialHeight.ft) : '')
  const [heightIn, setHeightIn] = useState<string>(initialHeight.inches !== '' ? String(initialHeight.inches) : '')
  const [currentLbs, setCurrentLbs] = useState<string>(
    profile.currentWeightKg ? String(kgToLbs(profile.currentWeightKg)) : ''
  )
  const [targetLbs, setTargetLbs] = useState<string>(
    profile.targetWeightKg ? String(kgToLbs(profile.targetWeightKg)) : ''
  )

  function handleHeightChange(ft: string, inches: string) {
    setHeightFt(ft)
    setHeightIn(inches)
    const ftNum = parseInt(ft) || 0
    const inNum = parseInt(inches) || 0
    if (ftNum > 0 || inNum > 0) {
      onChange({ heightCm: imperialToCm(ftNum, inNum) })
    } else {
      onChange({ heightCm: undefined })
    }
  }

  function handleCurrentWeightChange(lbs: string) {
    setCurrentLbs(lbs)
    onChange({ currentWeightKg: lbs ? lbsToKg(Number(lbs)) : undefined })
  }

  function handleTargetWeightChange(lbs: string) {
    setTargetLbs(lbs)
    onChange({ targetWeightKg: lbs ? lbsToKg(Number(lbs)) : undefined })
  }

  const inputCls = "w-full rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white"

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
        Body stats
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        All fields are optional — we use these to tailor recommendations.
      </p>

      <div className="mt-6 space-y-5">
        {/* Age + sex side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Age
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={100}
              placeholder="e.g. 28"
              value={profile.age ?? ''}
              onChange={(e) =>
                onChange({ age: e.target.value ? Number(e.target.value) : undefined })
              }
              className={inputCls}
            />
          </div>

          {/* Height — ft + in */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Height
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={8}
                  placeholder="5"
                  value={heightFt}
                  onChange={(e) => handleHeightChange(e.target.value, heightIn)}
                  className={inputCls}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">ft</span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={11}
                  placeholder="10"
                  value={heightIn}
                  onChange={(e) => handleHeightChange(heightFt, e.target.value)}
                  className={inputCls}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">in</span>
              </div>
            </div>
          </div>
        </div>

        {/* Biological sex */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
            Biological sex
          </label>
          <div className="flex gap-2">
            {SEX_OPTIONS.map(({ value, label }) => {
              const selected = profile.biologicalSex === value
              return (
                <button
                  key={value}
                  onClick={() => onChange({ biologicalSex: value })}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-xs font-semibold transition-all duration-150 ${
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

        {/* Weight fields — lbs */}
        <div className={`grid gap-4 ${showTargetWeight ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Current weight (lbs)
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min={0}
                placeholder="e.g. 185"
                value={currentLbs}
                onChange={(e) => handleCurrentWeightChange(e.target.value)}
                className={inputCls}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">lbs</span>
            </div>
          </div>

          {showTargetWeight && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                Target weight (lbs)
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min={0}
                  placeholder="e.g. 165"
                  value={targetLbs}
                  onChange={(e) => handleTargetWeightChange(e.target.value)}
                  className={inputCls}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">lbs</span>
              </div>
            </div>
          )}
        </div>
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
        Tell us what you have access to and any areas to work around.
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
          value={injuryNotes}
          onChange={(e) => onInjuryNotesChange(e.target.value)}
          className="w-full resize-none rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white"
        />
      </div>
    </div>
  )
}
