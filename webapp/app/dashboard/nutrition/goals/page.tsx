"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Save, Calculator, Scale } from 'lucide-react'
import {
  AreaChart, Area, CartesianGrid, ReferenceLine,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, SegmentedControl } from '@/components/ui'
import PlanCard from '@/components/goals/PlanCard'
import WeightLogSheet from '@/components/WeightLogSheet'
import {
  ACTIVITY_LABELS,
  DIRECTION_ADJUSTMENT,
  DIRECTION_LABELS,
  DIRECTION_EXPLANATION,
  calcTdee,
  calorieAdjustment,
  computeNutritionTargets,
  splitForPreset,
  MACRO_PRESET_LABELS,
  type MacroPreset,
  type ActivityLevel,
  type NutritionDirection,
} from '@/lib/nutrition/tdee'
import type { FitnessGoal } from '@/lib/programMatch'
import { toKg, kgToLbs, roundWeight, ftInToCm, cmToFtIn, displayWeight, type WeightUnit } from '@/lib/bodyUnits'

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
  goal?: { targetWeightKg: number | null }
}

/** Labels come from lib/nutrition/tdee so this page and the onboarding wizard
 *  describe the same choice the same way. They used to be hardcoded here,
 *  which is how "Gain Weight" in onboarding became "Gain Muscle" on this
 *  screen — the same +300 with two different names.
 *
 * The adjustment text is NOT a static lookup: it used to read the flat
 * DIRECTION_ADJUSTMENT constant, so "Lose Weight" always said "TDEE - 500"
 * no matter what pace was chosen on the Plan card above it. It now runs
 * through calorieAdjustment() with the member's own pace for whichever
 * direction the Plan is actually set to, so a 0.5 lb/week plan says -250 and a
 * 1.5 lb/week plan says -750 (subject to the same safety cap either way). */
function goalCardAdjustment(type: GoalType, tdee: number | null, paceLbPerWeek?: number): string {
  if (type === 'maintain') return 'TDEE'
  const applied = tdee != null ? calorieAdjustment(tdee, type, paceLbPerWeek) : DIRECTION_ADJUSTMENT[type]
  return `TDEE ${applied > 0 ? '+' : '−'} ${Math.abs(applied)} cal`
}

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
  const [activeTab, setActiveTab] = useState<'goals' | 'weight'>('goals')
  const [weightSheetOpen, setWeightSheetOpen] = useState(false)
  /** Full logged history — only needed for the Weight tab's chart. */
  const [weightSeries, setWeightSeries] = useState<{ date: string; value: number }[]>([])
  const [targetWeightKg, setTargetWeightKg] = useState<number | null>(null)
  // Bumped after logging weight so PlanCard (which owns its own fetch) remounts
  // and re-reads /api/goals instead of showing the pre-log current weight.
  const [planRefreshKey, setPlanRefreshKey] = useState(0)
  /** The active nutrition Goal's chosen pace (kg/week) and the direction it
   *  applies to — read once on load, then kept fresh by PlanCard's
   *  onPaceChange. This is what lets the calorie/macro targets below actually
   *  move when the Plan's pace chip is tapped, instead of only the ETA text. */
  const [planPaceKgPerWeek, setPlanPaceKgPerWeek] = useState<number | null>(null)
  const [planPaceDirection, setPlanPaceDirection] = useState<GoalType | null>(null)

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

  /** Pace only applies to the direction it was chosen for — a lose-weight
   *  pace has no meaning previewed against "Gain Weight". `override` lets a
   *  caller hand in a just-written pace before it has round-tripped into
   *  planPaceKgPerWeek state (see handlePlanPaceChange). */
  const paceForDirection = useCallback((goalType?: GoalType, override?: number): number | undefined => {
    if (override !== undefined) return override
    return goalType && goalType === planPaceDirection ? (planPaceKgPerWeek ?? undefined) : undefined
  }, [planPaceDirection, planPaceKgPerWeek])

  const applyGoalAdjustment = useCallback((baseTdee: number, goalType: GoalType, paceKgPerWeekOverride?: number): number => {
    const paceKg = paceForDirection(goalType, paceKgPerWeekOverride)
    const paceLb = paceKg != null ? kgToLbs(paceKg) : undefined
    return baseTdee + calorieAdjustment(baseTdee, goalType, paceLb)
  }, [paceForDirection])

  /**
   * Writes calories + macros for a preset.
   * 'recommended' defers to the shared computeNutritionTargets(); the
   * percentage presets keep their historical behaviour.
   */
  const applyMacroPreset = useCallback((preset: MacroPreset, cals: number, goalType?: GoalType, activity?: ActivityLevel, statsOverride?: typeof effectiveStats, paceKgPerWeekOverride?: number) => {
    if (preset === 'custom') return

    const targets = computeNutritionTargets({
      ...(statsOverride ?? effectiveStats),
      goals: userFitnessGoals,
      direction: goalType,
      activityLevel: activity,
      macroPreset: preset,
      paceKgPerWeek: paceForDirection(goalType, paceKgPerWeekOverride),
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
  }, [effectiveStats, userFitnessGoals, paceForDirection])

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          router.push('/login')
          return
        }

        const headers: HeadersInit = { 'Authorization': `Bearer ${token}` }

        const [goalsRes, progressRes, profileRes, planRes] = await Promise.all([
          fetch('/api/nutrition/goals', { headers }),
          fetch(`/api/progress?tz=${new Date().getTimezoneOffset()}`, { headers }),
          fetch('/api/profile', { headers }),
          fetch(`/api/goals?tz=${new Date().getTimezoneOffset()}`, { headers }),
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
          setWeightSeries(progressData.weightData ?? [])
          if (progressData.goal?.targetWeightKg) setTargetWeightKg(progressData.goal.targetWeightKg)
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

        if (planRes.ok) {
          const plan = await planRes.json()
          const paceKg = plan?.nutrition?.target?.paceKgPerWeek ?? null
          const dir = plan?.nutrition?.direction ?? null
          setPlanPaceKgPerWeek(paceKg)
          setPlanPaceDirection(dir)
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
   *  preset changes can never diverge from each other. Accepts an explicit
   *  tdee/stats pair for callers (like a fresh weigh-in) that need the
   *  recompute to use a value that hasn't round-tripped through state yet. */
  const applyTargets = useCallback((preset: MacroPreset, goalType: GoalType, activity: ActivityLevel, tdeeOverride?: number, statsOverride?: typeof effectiveStats, paceKgPerWeekOverride?: number) => {
    const effectiveTdee = tdeeOverride ?? tdee
    if (!effectiveTdee) return
    const adjustedCals = applyGoalAdjustment(effectiveTdee, goalType, paceKgPerWeekOverride)
    if (preset === 'custom') {
      setGoals(prev => ({ ...prev, calories: adjustedCals }))
      return
    }
    applyMacroPreset(preset, adjustedCals, goalType, activity, statsOverride, paceKgPerWeekOverride)
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

  /** The Plan card's pace picker writes straight to the Goal and only knew
   *  about its own ETA text — this is the other half of the connection: when
   *  the member taps a new pace chip, recompute calories/macros for it right
   *  away. Takes the pace PlanCard just wrote explicitly (rather than reading
   *  planPaceKgPerWeek state) because the state set below hasn't landed yet
   *  when applyTargets runs in this same call. */
  const handlePlanPaceChange = useCallback((paceKgPerWeek: number, direction: GoalType) => {
    setPlanPaceKgPerWeek(paceKgPerWeek)
    setPlanPaceDirection(direction)
    if (direction === goals.goalType) {
      applyTargets(macroPreset, goals.goalType, goals.activityLevel, undefined, undefined, paceKgPerWeek)
    }
  }, [goals.goalType, goals.activityLevel, macroPreset, applyTargets])

  /** Logging a weigh-in from the Weight tab has to move every number that
   *  reads off body weight: the chart point, the TDEE estimate, and — since
   *  TDEE feeds calories/macros — the daily targets too. effectiveStats/tdee
   *  are last-render values, so build the post-log stats inline instead of
   *  setting state and hoping a later render catches up before the member
   *  looks at the Goals tab. */
  const handleWeightLogged = (weight: number) => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    setWeightSeries(prev => {
      const filtered = prev.filter(d => d.date !== today)
      return [...filtered, { date: today, value: weight }]
    })
    const kg = toKg(weight, weightUnit)
    setUserWeight(weight)
    setProfileWeightKg(kg)
    setPlanRefreshKey(k => k + 1)

    const nextStats = { ...effectiveStats, currentWeightKg: kg }
    const nextTdee = calcTdee(nextStats, goals.activityLevel)
    setTdee(nextTdee)
    applyTargets(macroPreset, goals.goalType, goals.activityLevel, nextTdee ?? undefined, nextStats)
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

  // Reactive, unlike the old module-level GOAL_CARDS constant: the "TDEE ± X"
  // line now recomputes from calorieAdjustment() whenever TDEE or the Plan's
  // pace changes, instead of always showing the flat DIRECTION_ADJUSTMENT
  // regardless of which pace chip was tapped above.
  const goalCards = useMemo(
    () => (['lose', 'maintain', 'gain'] as GoalType[]).map((type) => ({
      type,
      label: DIRECTION_LABELS[type],
      description: DIRECTION_EXPLANATION[type],
      adjustment: goalCardAdjustment(
        type, tdee, type === planPaceDirection && planPaceKgPerWeek != null ? kgToLbs(planPaceKgPerWeek) : undefined,
      ),
    })),
    [tdee, planPaceDirection, planPaceKgPerWeek],
  )

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

  const targetWeightLbs = targetWeightKg ? roundWeight(kgToLbs(targetWeightKg)) : null

  return (
    <>
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

      <SegmentedControl
        className="mb-4 sm:mb-6"
        segments={[
          { value: 'goals', label: 'Goals' },
          { value: 'weight', label: 'Weight' },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* The weight goal as a plan: target, pace, ETA, on/behind pace. Shown
          on both tabs — it's the at-a-glance status either way. Remounted
          (via key) after a weigh-in so it re-reads /api/goals instead of
          showing the pre-log current weight. */}
      <PlanCard key={planRefreshKey} className="mb-4 sm:mb-6" onPaceChange={({ paceKgPerWeek, direction }) => handlePlanPaceChange(paceKgPerWeek, direction)} />

      {activeTab === 'weight' ? (
        <Card className="mb-4 sm:mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Body Weight</h2>
            {targetWeightLbs && (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                Goal: {targetWeightLbs} lbs
              </span>
            )}
          </div>

          {weightSeries.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={weightSeries} margin={{ left: -20, right: 8 }}>
                  <defs>
                    <linearGradient id="goalsWeightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#18181b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#18181b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    tickLine={false} axisLine={false}
                    interval="preserveStartEnd"
                    className="text-zinc-400 dark:text-zinc-600"
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    tickLine={false} axisLine={false}
                    className="text-zinc-400 dark:text-zinc-600"
                  />
                  <Tooltip
                    formatter={(v) => [`${v} lbs`, 'Weight']}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  {targetWeightLbs && (
                    <ReferenceLine
                      y={targetWeightLbs}
                      stroke="#22c55e"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: `Goal ${targetWeightLbs}`, fill: '#22c55e', fontSize: 10, position: 'insideTopRight' }}
                    />
                  )}
                  <Area
                    type="monotone" dataKey="value"
                    stroke="#18181b" strokeWidth={2}
                    fill="url(#goalsWeightGrad)"
                    dot={false} activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setWeightSheetOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Scale className="h-4 w-4" />
                  Log Weight
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">No weight logged yet</p>
              <button
                type="button"
                onClick={() => setWeightSheetOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Scale className="h-4 w-4" />
                Log Weight
              </button>
            </div>
          )}
        </Card>
      ) : (
      <>
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
          {goalCards.map((card) => (
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
      </>
      )}
    </PageTransition>

    <WeightLogSheet
      isOpen={weightSheetOpen}
      onClose={() => setWeightSheetOpen(false)}
      onLogged={handleWeightLogged}
      lastWeight={weightSeries.length ? weightSeries[weightSeries.length - 1].value : undefined}
      targetWeight={targetWeightLbs ?? undefined}
    />
    </>
  )
}
