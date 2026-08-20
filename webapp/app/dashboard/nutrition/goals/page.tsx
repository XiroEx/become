"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Save, Calculator } from 'lucide-react'
import { Card } from '@/components/ui'
import PlanCard from '@/components/goals/PlanCard'
import {
  ACTIVITY_LABELS,
  DIRECTION_ADJUSTMENT,
  DIRECTION_LABELS,
  DIRECTION_EXPLANATION,
  calcTdee,
  computeNutritionTargets,
  splitForPreset,
  MACRO_PRESET_LABELS,
  type MacroPreset,
  type ActivityLevel,
  type NutritionDirection,
} from '@/lib/nutrition/tdee'
import type { FitnessGoal } from '@/lib/programMatch'
import { toKg, ftInToCm, cmToFtIn, displayWeight, type WeightUnit } from '@/lib/bodyUnits'

/** Same three values as the NutritionGoal schema enum. */
type GoalType = NutritionDirection

interface NutritionGoals {
  calories: number
  protein: number
  carbs: number
  fats: number
  waterGoal: number
  goalType: GoalType
  activityLevel: ActivityLevel
}

interface ProgressData {
  weightData: { date: string; value: number }[]
  bmiData: { date: string; value: number }[]
  currentProgram: { name: string } | null
  stats: { streakDays: number }
}

/** Labels and adjustments come from lib/nutrition/tdee so this page and the
 *  onboarding wizard describe the same choice the same way. They used to be
 *  hardcoded here, which is how "Gain Weight" in onboarding became "Gain Muscle"
 *  on this screen — the same +300 with two different names. */
const GOAL_CARDS: { type: GoalType; label: string; description: string; adjustment: string }[] =
  (['lose', 'maintain', 'gain'] as GoalType[]).map((type) => ({
    type,
    label: DIRECTION_LABELS[type],
    description: DIRECTION_EXPLANATION[type],
    adjustment:
      DIRECTION_ADJUSTMENT[type] === 0
        ? 'TDEE'
        : `TDEE ${DIRECTION_ADJUSTMENT[type] > 0 ? '+' : '−'} ${Math.abs(DIRECTION_ADJUSTMENT[type])} cal`,
  }))

/** Every preset now runs through the shared computeNutritionTargets(), which
 *  applies the same bodyweight protein floor/cap here as during onboarding. The
 *  page used to own its own percentage maths, so a preset picked here produced
 *  different grams than the identical preset picked in the wizard. */
const MACRO_PRESET_KEYS: MacroPreset[] = ['recommended', 'balanced', 'high_protein', 'low_carb', 'custom']

function presetLabel(key: MacroPreset, direction: NutritionDirection): string {
  if (key === 'custom') return MACRO_PRESET_LABELS.custom
  const s = splitForPreset(key, direction)
  const suffix = key === 'recommended' ? ' (from your stats)' : ''
  return `${MACRO_PRESET_LABELS[key]}${suffix} — ${s.protein}/${s.carbs}/${s.fats}`
}

export default function NutritionGoalsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const [goals, setGoals] = useState<NutritionGoals>({
    calories: 2000,
    protein: 150,
    carbs: 200,
    fats: 65,
    waterGoal: 96,
    goalType: 'maintain',
    activityLevel: 'moderate'
  })

  const [goalsAreDefault, setGoalsAreDefault] = useState(false)
  // 'recommended' matches the onboarding wizard's math — the default so a
  // member who never touches this screen keeps the numbers they were shown.
  const [macroPreset, setMacroPreset] = useState<MacroPreset>('recommended')
  /** Latest LOGGED weight, in the member's display unit (see weightUnit). */
  const [userWeight, setUserWeight] = useState<number | null>(null)
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lbs')
  /** Canonical weight in kg off the profile — kept in sync by /api/weight on
   *  every log, so it is both fresh and unambiguous. Preferred over the log. */
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null)
  const [userHeightCm, setUserHeightCm] = useState<number | null>(null)
  const [userAge, setUserAge] = useState<number | null>(null)
  const [userSex, setUserSex] = useState<'male' | 'female' | null>(null)
  const [userFitnessGoals, setUserFitnessGoals] = useState<FitnessGoal[]>([])
  // Manual overrides shown when profile data is missing
  const [manualAge, setManualAge] = useState('')
  const [manualSex, setManualSex] = useState<'male' | 'female' | ''>('')
  const [manualHeightFt, setManualHeightFt] = useState('')
  const [manualHeightIn, setManualHeightIn] = useState('')
  const [tdee, setTdee] = useState<number | null>(null)

  /** Profile values with the manual fallbacks folded in. */
  const effectiveStats = useMemo(() => {
    const age = userAge ?? (manualAge ? parseInt(manualAge) : null)
    const sex = (userSex ?? (manualSex || null)) as 'male' | 'female' | null
    const heightCm = userHeightCm ?? (
      manualHeightFt
        ? ftInToCm(parseInt(manualHeightFt), parseInt(manualHeightIn || '0'))
        : null
    )
    return {
      age: age ?? undefined,
      biologicalSex: sex ?? undefined,
      heightCm: heightCm ?? undefined,
      // The profile's kg value is canonical. The logged weight is only a
      // fallback for members who last logged before /api/weight started syncing
      // the profile — and it MUST be read through the member's unit: this line
      // used to multiply by 0.453592 unconditionally, so a member tracking in
      // kg had their 95 kg treated as 95 lb and got a TDEE ~800 cal too low.
      currentWeightKg:
        profileWeightKg ?? (userWeight ? toKg(userWeight, weightUnit) : undefined),
    }
  }, [userAge, userSex, userHeightCm, userWeight, weightUnit, profileWeightKg, manualAge, manualSex, manualHeightFt, manualHeightIn])

  const applyGoalAdjustment = useCallback((baseTdee: number, goalType: GoalType): number => {
    return baseTdee + DIRECTION_ADJUSTMENT[goalType]
  }, [])

  /**
   * Writes calories + macros for a preset.
   * 'recommended' defers to the shared computeNutritionTargets(); the
   * percentage presets keep their historical behaviour.
   */
  const applyMacroPreset = useCallback((preset: MacroPreset, cals: number, goalType?: GoalType, activity?: ActivityLevel) => {
    if (preset === 'custom') return

    const targets = computeNutritionTargets({
      ...effectiveStats,
      goals: userFitnessGoals,
      direction: goalType,
      activityLevel: activity,
      macroPreset: preset,
    })
    if (!targets) return
    setGoals(prev => ({
      ...prev,
      // 'recommended' also re-derives calories; the explicit presets re-split the
      // calorie number already on screen.
      calories: preset === 'recommended' ? targets.calories : cals,
      protein: targets.protein,
      carbs: targets.carbs,
      fats: targets.fats,
    }))
  }, [effectiveStats, userFitnessGoals])

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          router.push('/login')
          return
        }

        const headers: HeadersInit = { 'Authorization': `Bearer ${token}` }

        const [goalsRes, progressRes, profileRes] = await Promise.all([
          fetch('/api/nutrition/goals', { headers }),
          fetch(`/api/progress?tz=${new Date().getTimezoneOffset()}`, { headers }),
          fetch('/api/profile', { headers }),
        ])

        if (goalsRes.ok) {
          const goalsData = await goalsRes.json()
          setGoalsAreDefault(!!goalsData._isDefault)
          setGoals({
            calories: goalsData.calories || 2000,
            protein: goalsData.protein || 150,
            carbs: goalsData.carbs || 200,
            fats: goalsData.fats || 65,
            waterGoal: goalsData.waterGoal || 96,
            goalType: goalsData.goalType || 'maintain',
            activityLevel: goalsData.activityLevel || 'moderate'
          })
        }

        if (progressRes.ok) {
          const progressData: ProgressData = await progressRes.json()
          if (progressData.weightData && progressData.weightData.length > 0) {
            const latestWeight = progressData.weightData[progressData.weightData.length - 1].value
            setUserWeight(latestWeight)
          }
        }

        if (profileRes.ok) {
          const profileData = await profileRes.json()
          const profile = profileData.profile || {}
          if (profile.age) setUserAge(profile.age)
          if (profile.heightCm) setUserHeightCm(profile.heightCm)
          if (profile.weightUnit === 'kg' || profile.weightUnit === 'lbs') {
            setWeightUnit(profile.weightUnit)
          }
          if (profile.currentWeightKg) setProfileWeightKg(profile.currentWeightKg)
          if (profile.biologicalSex === 'male' || profile.biologicalSex === 'female') {
            setUserSex(profile.biologicalSex)
          }
          // Goal set drives the protein target in the 'recommended' preset.
          const goalSet: FitnessGoal[] = profile.fitnessGoals?.length
            ? profile.fitnessGoals
            : profile.fitnessGoal
              ? [profile.fitnessGoal]
              : []
          setUserFitnessGoals(goalSet)
        }
      } catch (error) {
        console.error('Failed to fetch goals/progress:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  // Recalculate TDEE whenever any body metric or activity level changes
  useEffect(() => {
    setTdee(calcTdee(effectiveStats, goals.activityLevel))
  }, [effectiveStats, goals.activityLevel])

  /** Single path for "recompute calories + macros" so goal, activity and
   *  preset changes can never diverge from each other. */
  const applyTargets = useCallback((preset: MacroPreset, goalType: GoalType, activity: ActivityLevel) => {
    if (!tdee) return
    const adjustedCals = applyGoalAdjustment(tdee, goalType)
    if (preset === 'custom') {
      setGoals(prev => ({ ...prev, calories: adjustedCals }))
      return
    }
    applyMacroPreset(preset, adjustedCals, goalType, activity)
  }, [tdee, applyGoalAdjustment, applyMacroPreset])

  // Auto-apply TDEE on first load if user has never saved goals
  useEffect(() => {
    if (!tdee || loading) return
    if (goalsAreDefault) {
      applyTargets(macroPreset, goals.goalType, goals.activityLevel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tdee])

  const handleGoalTypeChange = (goalType: GoalType) => {
    setGoals(prev => ({ ...prev, goalType }))
    applyTargets(macroPreset, goalType, goals.activityLevel)
  }

  const handleActivityChange = (activityLevel: ActivityLevel) => {
    setGoals(prev => ({ ...prev, activityLevel }))
  }

  const handleRecalculate = () => {
    applyTargets(macroPreset, goals.goalType, goals.activityLevel)
  }

  const handlePresetChange = (preset: MacroPreset) => {
    setMacroPreset(preset)
    if (preset !== 'custom') {
      applyMacroPreset(preset, goals.calories, goals.goalType, goals.activityLevel)
    }
  }

  const getMacroPercentages = () => {
    const totalCals = (goals.protein * 4) + (goals.carbs * 4) + (goals.fats * 9)
    if (totalCals === 0) return { protein: 0, carbs: 0, fats: 0 }
    return {
      protein: Math.round((goals.protein * 4 / totalCals) * 100),
      carbs: Math.round((goals.carbs * 4 / totalCals) * 100),
      fats: Math.round((goals.fats * 9 / totalCals) * 100)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      const res = await fetch('/api/nutrition/goals', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(goals)
      })

      if (res.ok) {
        setSaveMessage('Goals saved successfully!')
        setTimeout(() => setSaveMessage(''), 3000)
      } else {
        setSaveMessage('Failed to save goals')
      }
    } catch (error) {
      console.error('Failed to save goals:', error)
      setSaveMessage('Failed to save goals')
    } finally {
      setSaving(false)
    }
  }

  const percentages = getMacroPercentages()

  if (loading) {
    return (
      <PageTransition className="pb-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-40 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-40 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-60 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3 sm:mb-6">
        <button
          onClick={() => router.push('/dashboard/nutrition')}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Nutrition Goals</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Set your daily calorie and macro targets</p>
        </div>
      </div>

      {/* User Stats */}
      {/* The weight goal as a plan: target, pace, ETA, on/behind pace. */}
      <PlanCard className="mb-4 sm:mb-6" />

      <Card className="mb-4 sm:mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Your Stats</h2>
        <div className="flex flex-wrap gap-6">
          {(profileWeightKg || userWeight) && (
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {profileWeightKg ? displayWeight(profileWeightKg, weightUnit) : userWeight}
                <span className="text-sm font-normal text-zinc-500"> {weightUnit}</span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Current Weight</p>
            </div>
          )}
          {userHeightCm && (
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {cmToFtIn(userHeightCm).ft}&apos;{cmToFtIn(userHeightCm).inches}&quot;
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Height</p>
            </div>
          )}
          {tdee && (
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{tdee}<span className="text-sm font-normal text-zinc-500"> cal</span></p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Estimated TDEE</p>
            </div>
          )}
        </div>

        {/* Manual override inputs when profile is missing height / age / sex */}
        {(!userHeightCm || !userAge || !userSex) && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/50">
            <p className="mb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Fill in missing info for TDEE calculation{' '}
              <a href="/dashboard/settings" className="text-blue-600 underline dark:text-blue-400">or update your details</a>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {!userAge && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Age</label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={manualAge}
                    onChange={(e) => setManualAge(e.target.value)}
                    placeholder="25"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>
              )}
              {!userSex && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Sex</label>
                  <select
                    value={manualSex}
                    onChange={(e) => setManualSex(e.target.value as 'male' | 'female' | '')}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              )}
              {!userHeightCm && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Height (ft)</label>
                    <input
                      type="number"
                      min="3"
                      max="8"
                      value={manualHeightFt}
                      onChange={(e) => setManualHeightFt(e.target.value)}
                      placeholder="5"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Height (in)</label>
                    <input
                      type="number"
                      min="0"
                      max="11"
                      value={manualHeightIn}
                      onChange={(e) => setManualHeightIn(e.target.value)}
                      placeholder="10"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Goal Type */}
      <div className="mb-4 sm:mb-6" data-tour="goals-type">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Goal</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {GOAL_CARDS.map((card) => (
            <button
              key={card.type}
              onClick={() => handleGoalTypeChange(card.type)}
              className={`cursor-pointer rounded-xl border p-3 text-left transition-all sm:p-4 ${
                goals.goalType === card.type
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                  : 'border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:border-zinc-700'
              }`}
            >
              <p className="text-sm font-semibold sm:text-base">{card.label}</p>
              <p className={`mt-0.5 text-xs ${
                goals.goalType === card.type
                  ? 'text-zinc-300 dark:text-zinc-600'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}>
                {card.adjustment}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Activity Level */}
      <Card className="mb-4 sm:mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Activity Level</h2>
        <select
          value={goals.activityLevel}
          onChange={(e) => handleActivityChange(e.target.value as ActivityLevel)}
          className="w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
        >
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
            <option key={level} value={level}>{ACTIVITY_LABELS[level]}</option>
          ))}
        </select>

        {tdee && (
          <button
            onClick={handleRecalculate}
            className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Calculator className="h-4 w-4" />
            Recalculate from TDEE ({applyGoalAdjustment(tdee, goals.goalType)} cal)
          </button>
        )}
      </Card>

      {/* Macro Preset */}
      <Card className="mb-4 sm:mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Macro Split</h2>
        <select
          value={macroPreset}
          onChange={(e) => handlePresetChange(e.target.value as MacroPreset)}
          className="w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
        >
          {MACRO_PRESET_KEYS.map((key) => (
            <option key={key} value={key}>{presetLabel(key, goals.goalType)}</option>
          ))}
        </select>
      </Card>

      {/* Calorie & Macro Inputs */}
      <Card className="mb-4 sm:mb-6" data-tour="goals-macros">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Daily Targets</h2>

        {/* Calories */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Calories</label>
          <input
            type="number"
            value={goals.calories}
            onChange={(e) => {
              const cal = Number(e.target.value)
              setGoals(prev => ({ ...prev, calories: cal }))
              setMacroPreset('custom')
            }}
            min={0}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
          />
        </div>

        {/* Protein */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Protein (g)</label>
            <span className="text-xs text-blue-600 dark:text-blue-400">{percentages.protein}%</span>
          </div>
          <input
            type="number"
            value={goals.protein}
            onChange={(e) => {
              setGoals(prev => ({ ...prev, protein: Number(e.target.value) }))
              setMacroPreset('custom')
            }}
            min={0}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
          />
        </div>

        {/* Carbs */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Carbs (g)</label>
            <span className="text-xs text-green-600 dark:text-green-400">{percentages.carbs}%</span>
          </div>
          <input
            type="number"
            value={goals.carbs}
            onChange={(e) => {
              setGoals(prev => ({ ...prev, carbs: Number(e.target.value) }))
              setMacroPreset('custom')
            }}
            min={0}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
          />
        </div>

        {/* Fats */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Fats (g)</label>
            <span className="text-xs text-yellow-600 dark:text-yellow-400">{percentages.fats}%</span>
          </div>
          <input
            type="number"
            value={goals.fats}
            onChange={(e) => {
              setGoals(prev => ({ ...prev, fats: Number(e.target.value) }))
              setMacroPreset('custom')
            }}
            min={0}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
          />
        </div>

        {/* Macro bar visualization */}
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          <div className="bg-blue-600 transition-all duration-300" style={{ width: `${percentages.protein}%` }} />
          <div className="bg-green-600 transition-all duration-300" style={{ width: `${percentages.carbs}%` }} />
          <div className="bg-yellow-400 transition-all duration-300" style={{ width: `${percentages.fats}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-600" /> Protein {percentages.protein}%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-600" /> Carbs {percentages.carbs}%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" /> Fats {percentages.fats}%
          </span>
        </div>
      </Card>

      {/* Water Goal */}
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Water Goal</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={goals.waterGoal}
            onChange={(e) => setGoals(prev => ({ ...prev, waterGoal: Number(e.target.value) }))}
            min={0}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
          />
          <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">oz</span>
        </div>
      </Card>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        data-tour="goals-save"
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Goals'}
      </button>

      {saveMessage && (
        <p className={`mt-3 text-center text-sm ${
          saveMessage.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {saveMessage}
        </p>
      )}
    </PageTransition>
  )
}
