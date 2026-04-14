'use client'

import { useState, useEffect, useCallback } from 'react'
import PageTransition from '@/components/PageTransition'
import { getToken } from '@/lib/clientAuth'
import type { FitnessGoal, ExperienceLevel, BiologicalSex, EquipmentType, WeightUnit, IUserProfile } from '@/models/User'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileResponse {
  profile: IUserProfile
  onboardingCompleted: boolean
  name: string
  email: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FITNESS_GOALS: { value: FitnessGoal; label: string; description: string; icon: string }[] = [
  { value: 'lose_weight', label: 'Lose Weight', description: 'Burn fat and get leaner', icon: '🔥' },
  { value: 'gain_muscle', label: 'Gain Muscle', description: 'Build size and strength', icon: '💪' },
  { value: 'maintain', label: 'Maintain', description: 'Stay at current fitness', icon: '⚖️' },
  { value: 'improve_performance', label: 'Performance', description: 'Enhance athletic output', icon: '⚡' },
  { value: 'general_health', label: 'General Health', description: 'Move and feel better', icon: '❤️' },
]

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

const BIOLOGICAL_SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const EQUIPMENT_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: 'none', label: 'No Equipment' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'cables', label: 'Cables' },
  { value: 'full_gym', label: 'Full Gym' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal | undefined>(undefined)
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | undefined>(undefined)
  const [weeklyAvailability, setWeeklyAvailability] = useState<number>(3)
  const [age, setAge] = useState<string>('')
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | undefined>(undefined)
  const [heightCm, setHeightCm] = useState<string>('')
  const [currentWeightKg, setCurrentWeightKg] = useState<string>('')
  const [targetWeightKg, setTargetWeightKg] = useState<string>('')
  const [equipmentAccess, setEquipmentAccess] = useState<EquipmentType[]>([])
  const [injuryNotes, setInjuryNotes] = useState<string>('')
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lbs')

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchProfile = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data: ProfileResponse = await res.json()
      setName(data.name ?? '')
      setEmail(data.email ?? '')
      const p = data.profile ?? {}
      setFitnessGoal(p.fitnessGoal)
      setExperienceLevel(p.experienceLevel)
      setWeeklyAvailability(p.weeklyAvailability ?? 3)
      setAge(p.age !== undefined ? String(p.age) : '')
      setBiologicalSex(p.biologicalSex)
      setHeightCm(p.heightCm !== undefined ? String(p.heightCm) : '')
      setCurrentWeightKg(p.currentWeightKg !== undefined ? String(p.currentWeightKg) : '')
      setTargetWeightKg(p.targetWeightKg !== undefined ? String(p.targetWeightKg) : '')
      setEquipmentAccess(p.equipmentAccess ?? [])
      setInjuryNotes(p.injuryNotes ?? '')
      setWeightUnit(p.weightUnit ?? 'lbs')
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const toggleEquipment = (eq: EquipmentType) => {
    setEquipmentAccess(prev =>
      prev.includes(eq) ? prev.filter(e => e !== eq) : [...prev, eq]
    )
  }

  const handleSave = async () => {
    const token = getToken()
    if (!token) return
    setSaving(true)
    try {
      const profile: Partial<IUserProfile> = {
        ...(fitnessGoal !== undefined && { fitnessGoal }),
        ...(experienceLevel !== undefined && { experienceLevel }),
        weeklyAvailability,
        ...(age !== '' && { age: Number(age) }),
        ...(biologicalSex !== undefined && { biologicalSex }),
        ...(heightCm !== '' && { heightCm: Number(heightCm) }),
        ...(currentWeightKg !== '' && { currentWeightKg: Number(currentWeightKg) }),
        ...(targetWeightKg !== '' && { targetWeightKg: Number(targetWeightKg) }),
        equipmentAccess,
        injuryNotes,
        weightUnit,
      }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, profile }),
      })
      if (res.ok) {
        showToast('Profile saved successfully')
      } else {
        showToast('Failed to save profile', 'error')
      }
    } catch {
      showToast('Failed to save profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageTransition className="space-y-6">
        <div className="mb-4 h-8 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        ))}
      </PageTransition>
    )
  }

  return (
    <PageTransition className="pb-10 space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Profile</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your account and fitness preferences.
        </p>
      </header>

      {/* Account */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Account</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Email cannot be changed.</p>
          </div>
        </div>
      </section>

      {/* Fitness Goal */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Fitness Goal</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FITNESS_GOALS.map(goal => (
            <button
              key={goal.value}
              onClick={() => setFitnessGoal(goal.value)}
              className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-150 ${
                fitnessGoal === goal.value
                  ? 'border-green-500 bg-green-50 dark:border-green-500 dark:bg-green-900/20'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600'
              }`}
            >
              <span className="text-2xl">{goal.icon}</span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${fitnessGoal === goal.value ? 'text-green-700 dark:text-green-400' : 'text-zinc-900 dark:text-white'}`}>
                  {goal.label}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{goal.description}</p>
              </div>
              {fitnessGoal === goal.value && (
                <div className="ml-auto shrink-0">
                  <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Experience & Schedule */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Experience &amp; Schedule</h2>

        {/* Experience Level */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Experience Level
          </label>
          <div className="flex gap-2">
            {EXPERIENCE_LEVELS.map(level => (
              <button
                key={level.value}
                onClick={() => setExperienceLevel(level.value)}
                className={`flex-1 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                  experienceLevel === level.value
                    ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/20 dark:text-green-400'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        {/* Weekly Availability */}
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Weekly Availability
          </label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setWeeklyAvailability(v => Math.max(1, v - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              aria-label="Decrease"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <div className="flex-1 text-center">
              <span className="text-2xl font-bold text-zinc-900 dark:text-white">{weeklyAvailability}</span>
              <span className="ml-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                day{weeklyAvailability !== 1 ? 's' : ''}/week
              </span>
            </div>
            <button
              onClick={() => setWeeklyAvailability(v => Math.min(7, v + 1))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              aria-label="Increase"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Body Stats */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Body Stats</h2>
          <div className="flex items-center rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            {(['lbs', 'kg'] as WeightUnit[]).map(unit => (
              <button
                key={unit}
                onClick={() => setWeightUnit(unit)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  weightUnit === unit
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* Age */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Age</label>
            <input
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              min={10}
              max={120}
              placeholder="—"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
            />
          </div>

          {/* Biological Sex */}
          <div className="col-span-2">
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Biological Sex</label>
            <div className="flex flex-wrap gap-2">
              {BIOLOGICAL_SEX_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBiologicalSex(opt.value)}
                  className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-all ${
                    biologicalSex === opt.value
                      ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/20 dark:text-green-400'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Height */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Height (cm)</label>
            <input
              type="number"
              value={heightCm}
              onChange={e => setHeightCm(e.target.value)}
              min={50}
              max={300}
              placeholder="—"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
            />
          </div>

          {/* Current Weight */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Current Weight ({weightUnit})</label>
            <input
              type="number"
              value={currentWeightKg}
              onChange={e => setCurrentWeightKg(e.target.value)}
              min={20}
              max={500}
              step={0.1}
              placeholder="—"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
            />
          </div>

          {/* Target Weight */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Target Weight ({weightUnit})</label>
            <input
              type="number"
              value={targetWeightKg}
              onChange={e => setTargetWeightKg(e.target.value)}
              min={20}
              max={500}
              step={0.1}
              placeholder="—"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
            />
          </div>
        </div>
      </section>

      {/* Equipment & Injuries */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Equipment &amp; Injuries</h2>

        {/* Equipment multi-select */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Equipment Access
          </label>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => toggleEquipment(opt.value)}
                className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-all ${
                  equipmentAccess.includes(opt.value)
                    ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/20 dark:text-green-400'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Injury Notes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Injury Notes
            <span className="ml-1 font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            value={injuryNotes}
            onChange={e => setInjuryNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Bad left knee, shoulder impingement..."
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 resize-none"
          />
        </div>
      </section>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-xl bg-zinc-900 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving...
          </span>
        ) : (
          'Save Changes'
        )}
      </button>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg transition-all duration-300 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </PageTransition>
  )
}
