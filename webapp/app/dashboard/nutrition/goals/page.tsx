"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Save, Calculator } from 'lucide-react'

type GoalType = 'lose' | 'maintain' | 'gain'
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

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

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly Active',
  moderate: 'Moderately Active',
  active: 'Active',
  very_active: 'Very Active'
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
}

const GOAL_CARDS: { type: GoalType; label: string; description: string; adjustment: string }[] = [
  { type: 'lose', label: 'Lose Weight', description: 'Caloric deficit for fat loss', adjustment: 'TDEE - 500 cal' },
  { type: 'maintain', label: 'Maintain', description: 'Stay at current weight', adjustment: 'TDEE' },
  { type: 'gain', label: 'Gain Muscle', description: 'Caloric surplus for growth', adjustment: 'TDEE + 300 cal' }
]

type MacroPreset = 'balanced' | 'high_protein' | 'low_carb' | 'custom'

const MACRO_PRESETS: { key: MacroPreset; label: string; protein: number; carbs: number; fats: number }[] = [
  { key: 'balanced', label: 'Balanced (30/40/30)', protein: 30, carbs: 40, fats: 30 },
  { key: 'high_protein', label: 'High Protein (40/30/30)', protein: 40, carbs: 30, fats: 30 },
  { key: 'low_carb', label: 'Low Carb (35/25/40)', protein: 35, carbs: 25, fats: 40 },
  { key: 'custom', label: 'Custom', protein: 0, carbs: 0, fats: 0 }
]

const DEFAULT_AGE = 25

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

  const [macroPreset, setMacroPreset] = useState<MacroPreset>('balanced')
  const [userWeight, setUserWeight] = useState<number | null>(null)
  const [userHeight, setUserHeight] = useState<number | null>(null)
  const [tdee, setTdee] = useState<number | null>(null)

  const calculateTDEE = useCallback((weightKg: number, heightCm: number, activity: ActivityLevel): number => {
    // Mifflin-St Jeor (using default for "male" path — the formula given uses -161 which is actually female)
    const bmr = 10 * weightKg + 6.25 * heightCm - 5 * DEFAULT_AGE - 161
    return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity])
  }, [])

  const applyGoalAdjustment = useCallback((baseTdee: number, goalType: GoalType): number => {
    switch (goalType) {
      case 'lose': return baseTdee - 500
      case 'gain': return baseTdee + 300
      default: return baseTdee
    }
  }, [])

  const applyMacroPreset = useCallback((preset: MacroPreset, cals: number) => {
    const found = MACRO_PRESETS.find(p => p.key === preset)
    if (!found || preset === 'custom') return

    const proteinGrams = Math.round((cals * (found.protein / 100)) / 4)
    const carbsGrams = Math.round((cals * (found.carbs / 100)) / 4)
    const fatsGrams = Math.round((cals * (found.fats / 100)) / 9)

    setGoals(prev => ({
      ...prev,
      calories: cals,
      protein: proteinGrams,
      carbs: carbsGrams,
      fats: fatsGrams
    }))
  }, [])

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          router.push('/login')
          return
        }

        const headers: HeadersInit = { 'Authorization': `Bearer ${token}` }

        const [goalsRes, progressRes] = await Promise.all([
          fetch('/api/nutrition/goals', { headers }),
          fetch('/api/progress', { headers })
        ])

        if (goalsRes.ok) {
          const goalsData = await goalsRes.json()
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
          // Get the most recent weight from weightData
          if (progressData.weightData && progressData.weightData.length > 0) {
            const latestWeight = progressData.weightData[progressData.weightData.length - 1].value
            // Weight is in lbs from progress API — convert to kg for TDEE
            setUserWeight(latestWeight)
          }
          // Height is sometimes available from bmiData context or user profile
          // We look for height in progress data
          const raw = progressData as ProgressData & { height?: number }
          if (raw.height) {
            setUserHeight(raw.height)
          }
        }
      } catch (error) {
        console.error('Failed to fetch goals/progress:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  // Recalculate TDEE whenever weight, height, or activity level changes
  useEffect(() => {
    if (userWeight && userHeight) {
      const weightKg = userWeight * 0.453592
      const heightCm = userHeight * 2.54
      const calculatedTdee = calculateTDEE(weightKg, heightCm, goals.activityLevel)
      setTdee(calculatedTdee)
    }
  }, [userWeight, userHeight, goals.activityLevel, calculateTDEE])

  const handleGoalTypeChange = (goalType: GoalType) => {
    setGoals(prev => ({ ...prev, goalType }))

    if (tdee) {
      const adjustedCals = applyGoalAdjustment(tdee, goalType)
      if (macroPreset !== 'custom') {
        applyMacroPreset(macroPreset, adjustedCals)
      } else {
        setGoals(prev => ({ ...prev, goalType, calories: adjustedCals }))
      }
    }
  }

  const handleActivityChange = (activityLevel: ActivityLevel) => {
    setGoals(prev => ({ ...prev, activityLevel }))
  }

  const handleRecalculate = () => {
    if (!tdee) return
    const adjustedCals = applyGoalAdjustment(tdee, goals.goalType)
    if (macroPreset !== 'custom') {
      applyMacroPreset(macroPreset, adjustedCals)
    } else {
      setGoals(prev => ({ ...prev, calories: adjustedCals }))
    }
  }

  const handlePresetChange = (preset: MacroPreset) => {
    setMacroPreset(preset)
    if (preset !== 'custom') {
      applyMacroPreset(preset, goals.calories)
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
          <div className="h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-60 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
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
      {(userWeight || userHeight) && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Your Stats</h2>
          <div className="flex gap-6">
            {userWeight && (
              <div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white">{userWeight}<span className="text-sm font-normal text-zinc-500"> lbs</span></p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Current Weight</p>
              </div>
            )}
            {userHeight && (
              <div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {Math.floor(userHeight / 12)}&apos;{userHeight % 12}&quot;
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
        </div>
      )}

      {/* Goal Type */}
      <div className="mb-4 sm:mb-6">
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
      <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:mb-6">
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
      </div>

      {/* Macro Preset */}
      <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Macro Split</h2>
        <select
          value={macroPreset}
          onChange={(e) => handlePresetChange(e.target.value as MacroPreset)}
          className="w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
        >
          {MACRO_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>{preset.label}</option>
          ))}
        </select>
      </div>

      {/* Calorie & Macro Inputs */}
      <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:mb-6">
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
          <div className="bg-yellow-600 transition-all duration-300" style={{ width: `${percentages.fats}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-600" /> Protein {percentages.protein}%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-600" /> Carbs {percentages.carbs}%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-600" /> Fats {percentages.fats}%
          </span>
        </div>
      </div>

      {/* Water Goal */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
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
