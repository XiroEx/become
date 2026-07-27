'use client'

import { useState, useEffect, useCallback } from 'react'
import PageTransition from '@/components/PageTransition'
import { BackButton } from '@/components/ui/BackButton'
import { getToken } from '@/lib/clientAuth'
import PasskeySetupButton from '@/components/PasskeySetupButton'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import type { FitnessGoal, ExperienceLevel, BiologicalSex, EquipmentType, WeightUnit, IUserProfile, PlanPromoteMode } from '@/models/User'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileResponse {
  profile: IUserProfile
  onboardingCompleted: boolean
  name: string
  email: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FITNESS_GOALS = 3

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

// ─── Notification types & helpers ─────────────────────────────────────────────

type NotificationPermissionState = 'granted' | 'denied' | 'default'

interface NotificationPrefs {
  streakAtRisk: boolean
  workoutReminder: boolean
  mealReminder: boolean
  reEngagement: boolean
  chatMessage: boolean
}

type NotificationPrefKey = keyof NotificationPrefs

interface PreferencesResponse {
  preferences?: Partial<NotificationPrefs>
}

const NOTIFICATION_TOGGLES: { key: NotificationPrefKey; label: string; sublabel: string }[] = [
  { key: 'streakAtRisk', label: 'Streak at risk', sublabel: 'When your streak is about to expire' },
  { key: 'workoutReminder', label: 'Workout reminder', sublabel: 'When you have a session scheduled today' },
  { key: 'mealReminder', label: 'Meal log reminder', sublabel: "Evening nudge when you haven't logged any food" },
  { key: 'reEngagement', label: 'Re-engagement', sublabel: "When you've been inactive for a few days" },
  { key: 'chatMessage', label: 'Chat messages', sublabel: 'When someone sends you a message' },
]

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

// ─── Unit conversion helpers ──────────────────────────────────────────────────

function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = cm / 2.54
  return { ft: Math.floor(totalInches / 12), inches: Math.round(totalInches % 12) }
}

function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * 2.54)
}

function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462)
}

function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 10) / 10
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'training' | 'settings'>('profile')
  const { toast, showToast } = useToast()

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // Ordered goal set — index 0 is the primary goal. Kept as a list so editing
  // here doesn't wipe the secondary goals picked during onboarding.
  const [fitnessGoals, setFitnessGoals] = useState<FitnessGoal[]>([])
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | undefined>(undefined)
  const [weeklyAvailability, setWeeklyAvailability] = useState<number>(3)
  const [age, setAge] = useState<string>('')
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | undefined>(undefined)

  // Height — separate imperial (ft/in) and metric (cm) state
  const [heightFt, setHeightFt] = useState<string>('')
  const [heightIn, setHeightIn] = useState<string>('')
  const [heightCm, setHeightCm] = useState<string>('')

  // Weight — display values in current unit
  const [weightDisplay, setWeightDisplay] = useState<string>('')
  const [targetWeightDisplay, setTargetWeightDisplay] = useState<string>('')

  const [equipmentAccess, setEquipmentAccess] = useState<EquipmentType[]>([])
  const [injuryNotes, setInjuryNotes] = useState<string>('')
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lbs')
  // Plan promotion mode (meal-plan PR 4). Default 'manual' — silent
  // promotion is opt-in.
  const [planPromoteMode, setPlanPromoteMode] = useState<PlanPromoteMode>('manual')

  const isImperial = weightUnit === 'lbs'

  // Notifications
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>('default')
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    streakAtRisk: true,
    workoutReminder: true,
    mealReminder: true,
    reEngagement: true,
    chatMessage: true,
  })
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(true)
  const [enablingNotifications, setEnablingNotifications] = useState(false)

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
      setFitnessGoals(p.fitnessGoals?.length ? p.fitnessGoals : p.fitnessGoal ? [p.fitnessGoal] : [])
      setExperienceLevel(p.experienceLevel)
      setWeeklyAvailability(p.weeklyAvailability ?? 3)
      setAge(p.age !== undefined ? String(p.age) : '')
      setBiologicalSex(p.biologicalSex)
      setEquipmentAccess(p.equipmentAccess ?? [])
      setInjuryNotes(p.injuryNotes ?? '')
      setPlanPromoteMode(p.planPromoteMode ?? 'manual')

      const unit: WeightUnit = p.weightUnit ?? 'lbs'
      setWeightUnit(unit)

      if (unit === 'lbs') {
        // Convert stored cm → ft/in
        if (p.heightCm !== undefined) {
          const { ft, inches } = cmToFtIn(p.heightCm)
          setHeightFt(String(ft))
          setHeightIn(String(inches))
        }
        // Convert stored kg → lbs
        setWeightDisplay(p.currentWeightKg !== undefined ? String(kgToLbs(p.currentWeightKg)) : '')
        setTargetWeightDisplay(p.targetWeightKg !== undefined ? String(kgToLbs(p.targetWeightKg)) : '')
      } else {
        setHeightCm(p.heightCm !== undefined ? String(p.heightCm) : '')
        setWeightDisplay(p.currentWeightKg !== undefined ? String(p.currentWeightKg) : '')
        setTargetWeightDisplay(p.targetWeightKg !== undefined ? String(p.targetWeightKg) : '')
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // ─── Notifications ────────────────────────────────────────────────────────

  const fetchNotifPrefs = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setNotifPrefsLoading(false)
      return
    }
    try {
      const res = await fetch('/api/notifications/preferences', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data: PreferencesResponse = await res.json()
      const p = data.preferences ?? {}
      setNotifPrefs({
        streakAtRisk: p.streakAtRisk ?? true,
        workoutReminder: p.workoutReminder ?? true,
        mealReminder: p.mealReminder ?? true,
        reEngagement: p.reEngagement ?? true,
        chatMessage: p.chatMessage ?? true,
      })
    } catch {
      // ignore — defaults remain
    } finally {
      setNotifPrefsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPrefsLoading(false)
      return
    }
    const permission = Notification.permission as NotificationPermissionState
    setNotifPermission(permission)
    if (permission === 'granted') {
      fetchNotifPrefs()
    } else {
      setNotifPrefsLoading(false)
    }
  }, [fetchNotifPrefs])

  const handleNotifToggle = async (key: NotificationPrefKey, value: boolean) => {
    const previous = notifPrefs[key]
    // Optimistic update
    setNotifPrefs(prev => ({ ...prev, [key]: value }))

    const token = getToken()
    if (!token) {
      setNotifPrefs(prev => ({ ...prev, [key]: previous }))
      showToast('Failed to save preference', 'error')
      return
    }
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [key]: value }),
      })
      if (!res.ok) throw new Error('PATCH failed')
    } catch {
      setNotifPrefs(prev => ({ ...prev, [key]: previous }))
      showToast('Failed to save preference', 'error')
    }
  }

  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setEnablingNotifications(true)
    try {
      const permission = await Notification.requestPermission()
      setNotifPermission(permission as NotificationPermissionState)
      if (permission !== 'granted') return

      // Subscribe to push, mirroring NotificationOptIn logic
      if ('serviceWorker' in navigator && 'PushManager' in window && VAPID_PUBLIC_KEY) {
        try {
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
          })

          const token = getToken()
          if (token) {
            await fetch('/api/notifications/subscribe', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                platform: 'web',
                endpoint: sub.endpoint,
                keys: {
                  p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
                  auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
                },
              }),
            })
          }
        } catch (err) {
          console.warn('Push subscription failed:', err)
        }
      }

      // Now that permission is granted, load per-type preferences
      setNotifPrefsLoading(true)
      await fetchNotifPrefs()
      showToast('Notifications enabled')
    } catch {
      showToast('Failed to enable notifications', 'error')
    } finally {
      setEnablingNotifications(false)
    }
  }

  // Convert existing values when the user switches units
  const handleUnitToggle = (newUnit: WeightUnit) => {
    if (newUnit === weightUnit) return

    if (newUnit === 'lbs') {
      // metric → imperial
      if (heightCm !== '') {
        const { ft, inches } = cmToFtIn(Number(heightCm))
        setHeightFt(String(ft))
        setHeightIn(String(inches))
        setHeightCm('')
      }
      if (weightDisplay !== '') setWeightDisplay(String(kgToLbs(Number(weightDisplay))))
      if (targetWeightDisplay !== '') setTargetWeightDisplay(String(kgToLbs(Number(targetWeightDisplay))))
    } else {
      // imperial → metric
      if (heightFt !== '' || heightIn !== '') {
        setHeightCm(String(ftInToCm(Number(heightFt) || 0, Number(heightIn) || 0)))
        setHeightFt('')
        setHeightIn('')
      }
      if (weightDisplay !== '') setWeightDisplay(String(lbsToKg(Number(weightDisplay))))
      if (targetWeightDisplay !== '') setTargetWeightDisplay(String(lbsToKg(Number(targetWeightDisplay))))
    }

    setWeightUnit(newUnit)
  }

  const toggleEquipment = (eq: EquipmentType) => {
    setEquipmentAccess(prev =>
      prev.includes(eq) ? prev.filter(e => e !== eq) : [...prev, eq]
    )
  }

  // Derive the storage values (always cm/kg) from display state
  const getStorageValues = () => {
    const storedHeightCm = isImperial
      ? (heightFt !== '' || heightIn !== '')
        ? ftInToCm(Number(heightFt) || 0, Number(heightIn) || 0)
        : undefined
      : heightCm !== '' ? Number(heightCm) : undefined

    const storedWeightKg = weightDisplay !== ''
      ? isImperial ? lbsToKg(Number(weightDisplay)) : Number(weightDisplay)
      : undefined

    const storedTargetKg = targetWeightDisplay !== ''
      ? isImperial ? lbsToKg(Number(targetWeightDisplay)) : Number(targetWeightDisplay)
      : undefined

    return { storedHeightCm, storedWeightKg, storedTargetKg }
  }

  /** Same ordered multi-select semantics as onboarding: first pick is primary,
   *  tapping at the cap swaps out the least important pick. */
  const toggleFitnessGoal = (goal: FitnessGoal) => {
    setFitnessGoals(current => {
      if (current.includes(goal)) return current.filter(g => g !== goal)
      if (current.length >= MAX_FITNESS_GOALS) {
        return [...current.slice(0, MAX_FITNESS_GOALS - 1), goal]
      }
      return [...current, goal]
    })
  }

  const handleSave = async () => {
    const token = getToken()
    if (!token) return
    setSaving(true)
    try {
      const { storedHeightCm, storedWeightKg, storedTargetKg } = getStorageValues()

      const profile: Partial<IUserProfile> = {
        // fitnessGoal mirrors the primary so every existing consumer
        // (dashboard, nudge modal, profile icon, AI context) keeps working.
        ...(fitnessGoals.length > 0 && { fitnessGoal: fitnessGoals[0], fitnessGoals }),
        ...(experienceLevel !== undefined && { experienceLevel }),
        weeklyAvailability,
        ...(age !== '' && { age: Number(age) }),
        ...(biologicalSex !== undefined && { biologicalSex }),
        ...(storedHeightCm !== undefined && { heightCm: storedHeightCm }),
        ...(storedWeightKg !== undefined && { currentWeightKg: storedWeightKg }),
        ...(storedTargetKg !== undefined && { targetWeightKg: storedTargetKg }),
        equipmentAccess,
        injuryNotes,
        weightUnit,
        planPromoteMode,
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

  // BMI uses raw cm/kg regardless of display unit
  const getBmiValues = () => {
    const { storedHeightCm, storedWeightKg } = getStorageValues()
    return { bmiCm: storedHeightCm, bmiKg: storedWeightKg }
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

  const { bmiCm, bmiKg } = getBmiValues()

  const TABS = [
    { id: 'profile', label: 'Profile' },
    { id: 'training', label: 'Training' },
    { id: 'settings', label: 'Settings' },
  ] as const

  const SaveButton = () => (
    <button
      onClick={handleSave}
      disabled={saving}
      data-tour="settings-save"
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
  )

  return (
    <PageTransition className="pb-10 space-y-4">
      {/* Header */}
      <header>
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Settings</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your account and fitness preferences.
        </p>
      </header>

      {/* Tab bar */}
      <div data-tour="settings-tabs" className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <>
          {/* Account */}
          <section data-tour="settings-account" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Account</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Email cannot be changed.</p>
              </div>
              <PasskeySetupButton />
            </div>
          </section>

          {/* Body Stats */}
          <section data-tour="settings-body-stats" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Body Stats</h2>
                {bmiCm && bmiKg && (() => {
                  const bmi = bmiKg / Math.pow(bmiCm / 100, 2)
                  const cat = bmi < 18.5 ? { label: 'Underweight', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' }
                    : bmi < 25 ? { label: 'Normal', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
                    : bmi < 30 ? { label: 'Overweight', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
                    : { label: 'Obese', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
                  return (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cat.cls}`}>
                      BMI {bmi.toFixed(1)} · {cat.label}
                    </span>
                  )
                })()}
              </div>
              <div className="flex items-center rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                {(['lbs', 'kg'] as WeightUnit[]).map(unit => (
                  <button
                    key={unit}
                    onClick={() => handleUnitToggle(unit)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                      weightUnit === unit
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    {unit === 'lbs' ? 'Imperial' : 'Metric'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Height {isImperial ? '(ft / in)' : '(cm)'}
                </label>
                {isImperial ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={heightFt}
                        onChange={e => setHeightFt(e.target.value)}
                        min={1}
                        max={9}
                        placeholder="5"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 pr-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">ft</span>
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={heightIn}
                        onChange={e => setHeightIn(e.target.value)}
                        min={0}
                        max={11}
                        placeholder="10"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 pr-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">in</span>
                    </div>
                  </div>
                ) : (
                  <input
                    type="number"
                    value={heightCm}
                    onChange={e => setHeightCm(e.target.value)}
                    min={50}
                    max={300}
                    placeholder="—"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Current Weight ({isImperial ? 'lbs' : 'kg'})
                </label>
                <input
                  type="number"
                  value={weightDisplay}
                  onChange={e => setWeightDisplay(e.target.value)}
                  min={isImperial ? 44 : 20}
                  max={isImperial ? 1100 : 500}
                  step={isImperial ? 1 : 0.1}
                  placeholder="—"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Target Weight ({isImperial ? 'lbs' : 'kg'})
                </label>
                <input
                  type="number"
                  value={targetWeightDisplay}
                  onChange={e => setTargetWeightDisplay(e.target.value)}
                  min={isImperial ? 44 : 20}
                  max={isImperial ? 1100 : 500}
                  step={isImperial ? 1 : 0.1}
                  placeholder="—"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                />
              </div>
            </div>
          </section>

          <SaveButton />
        </>
      )}

      {/* ── Training tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'training' && (
        <>
          {/* Fitness Goal */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Fitness Goals</h2>
            <p className="mb-4 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Pick up to {MAX_FITNESS_GOALS}. Your first pick is your primary goal — it drives
              your program recommendations, your calorie direction and your dashboard.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FITNESS_GOALS.map(goal => {
                const rank = fitnessGoals.indexOf(goal.value)
                const selected = rank >= 0
                return (
                  <button
                    key={goal.value}
                    onClick={() => toggleFitnessGoal(goal.value)}
                    data-testid={`settings-goal-${goal.value}`}
                    aria-pressed={selected}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-150 ${
                      selected
                        ? 'border-green-500 bg-green-50 dark:border-green-500 dark:bg-green-900/20'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600'
                    }`}
                  >
                    <span className="text-2xl">{goal.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${selected ? 'text-green-700 dark:text-green-400' : 'text-zinc-900 dark:text-white'}`}>
                        {goal.label}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {selected ? (rank === 0 ? 'Primary goal' : `Also #${rank + 1}`) : goal.description}
                      </p>
                    </div>
                    {selected && (
                      <div className="ml-auto shrink-0">
                        <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Experience & Schedule */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Experience &amp; Schedule</h2>
            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Experience Level</label>
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
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Weekly Availability</label>
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

          {/* Equipment & Injuries */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Equipment &amp; Injuries</h2>
            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Equipment Access</label>
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
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Injury Notes <span className="font-normal text-zinc-400">(optional)</span>
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

          <SaveButton />
        </>
      )}

      {/* ── Settings tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <>
          {/* Notifications */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Notifications</h2>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      notifPermission === 'granted'
                        ? 'bg-green-500'
                        : notifPermission === 'denied'
                          ? 'bg-red-500'
                          : 'bg-zinc-400 dark:bg-zinc-500'
                    }`}
                  />
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">
                    {notifPermission === 'granted' ? 'Active' : notifPermission === 'denied' ? 'Blocked' : 'Not enabled'}
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {notifPermission === 'granted'
                    ? "You'll receive push notifications"
                    : notifPermission === 'denied'
                      ? 'Enable in your browser settings to receive notifications'
                      : 'Turn on notifications to stay on your streak'}
                </p>
              </div>
              {notifPermission === 'default' && (
                <button
                  type="button"
                  onClick={enableNotifications}
                  disabled={enablingNotifications}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {enablingNotifications ? 'Enabling…' : 'Enable'}
                </button>
              )}
            </div>
            {notifPermission === 'granted' && (
              <div className="mt-5 space-y-4 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                {notifPrefsLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-4 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                          <div className="h-3 w-48 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                        </div>
                        <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
                      </div>
                    ))}
                  </div>
                ) : (
                  NOTIFICATION_TOGGLES.map(({ key, label, sublabel }) => {
                    const value = notifPrefs[key]
                    return (
                      <div key={key} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sublabel}</p>
                        </div>
                        <button
                          role="switch"
                          aria-checked={value}
                          aria-label={label}
                          onClick={() => handleNotifToggle(key, !value)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                            value ? 'bg-blue-600' : 'bg-zinc-600'
                          }`}
                        >
                          <span
                            className={`mt-0.5 inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
                              value ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </section>

          {/* Nutrition Planning */}
          <section
            id="nutrition"
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
          >
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-white">Nutrition Planning</h2>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              When a planned meal&apos;s day arrives, how should it become a log?
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                { value: 'manual' as const, label: 'Manual', description: 'Tap "Log it" to confirm each plan as you eat it.' },
                { value: 'auto' as const, label: 'Auto', description: "Promote today's plans on day-view load. You can undo." },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlanPromoteMode(opt.value)}
                  className={`flex flex-col gap-1 rounded-xl border-2 p-3 text-left transition-all duration-150 ${
                    planPromoteMode === opt.value
                      ? 'border-green-500 bg-green-50 dark:border-green-500 dark:bg-green-900/20'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600'
                  }`}
                  aria-pressed={planPromoteMode === opt.value}
                >
                  <span className={`text-sm font-semibold ${planPromoteMode === opt.value ? 'text-green-700 dark:text-green-400' : 'text-zinc-900 dark:text-white'}`}>
                    {opt.label}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{opt.description}</span>
                </button>
              ))}
            </div>
          </section>

          <SaveButton />
        </>
      )}

      <Toast toast={toast} />
    </PageTransition>
  )
}
