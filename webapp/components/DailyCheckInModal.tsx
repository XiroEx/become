 "use client"

import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLockScroll } from '@/lib/useLockScroll'
import { formatWeight, formatWeightDelta, holdBand } from '@/lib/dashboard/goalTile'
import type { GoalReached } from '@/lib/goals/reached'

export type MoodLevel = 1 | 2 | 3 | 4 | 5 // 1 = bad, 2 = not great, 3 = okay, 4 = pretty good, 5 = great

interface DailyCheckInModalProps {
  isOpen: boolean
  onClose: (data: { mood?: MoodLevel; weight?: number; goalReached?: GoalReached }) => void
  daysSinceMood?: number
  daysSinceWeight?: number
  lastWeight?: number
  weightUnit?: 'lbs' | 'kg'
  /** Target weight, already in `weightUnit`. Undefined when no goal is set. */
  targetWeight?: number
}

/** What the weight step says about the goal, live as the member types — the
 *  highest-attention moment for it, and previously the one place that said
 *  nothing about the goal at all. */
export function goalLine(typedWeight: string, targetWeight: number | undefined, unit: 'lbs' | 'kg'): string | null {
  if (targetWeight == null || !(targetWeight > 0)) return null
  const target = `${formatWeight(targetWeight, unit)} ${unit}`
  const typed = parseFloat(typedWeight)
  if (!(typed > 0)) return `Goal: ${target}`
  const diff = typed - targetWeight
  if (Math.abs(diff) <= holdBand(unit)) return `Goal: ${target} — right there`
  return `Goal: ${target} — ${formatWeightDelta(diff, unit)} ${diff > 0 ? 'to go' : 'past it'}`
}

// Solid color face components - 5 mood levels
function BadFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-red-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M14 35 Q24 26 34 35" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function NotGreatFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-orange-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M16 34 Q24 30 32 34" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function OkayFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-amber-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <line 
        x1="16" y1="32" x2="32" y2="32" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function PrettyGoodFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-lime-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M16 31 Q24 36 32 31" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function GreatFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-emerald-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M14 30 Q24 40 34 30" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

// Time-based greeting configuration
function getTimeBasedGreeting() {
  const hour = new Date().getHours()
  
  if (hour >= 5 && hour < 12) {
    return {
      greeting: 'Good morning!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" 
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
      )
    }
  } else if (hour >= 12 && hour < 17) {
    return {
      greeting: 'Good afternoon!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <circle cx="12" cy="12" r="6" />
          </svg>
        </div>
      )
    }
  } else if (hour >= 17 && hour < 21) {
    return {
      greeting: 'Good evening!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-orange-400 to-rose-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <circle cx="12" cy="14" r="5" />
            <path d="M2 14h3M19 14h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
      )
    }
  } else {
    return {
      greeting: 'Good night!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </div>
      )
    }
  }
}

const moodOptions = [
  { 
    level: 1 as MoodLevel, 
    Face: BadFace, 
    label: 'Bad',
    color: 'from-red-400 to-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-300 dark:border-red-800',
    hoverColor: 'hover:border-red-400 dark:hover:border-red-600'
  },
  { 
    level: 2 as MoodLevel, 
    Face: NotGreatFace, 
    label: 'Not Great',
    color: 'from-orange-400 to-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-300 dark:border-orange-800',
    hoverColor: 'hover:border-orange-400 dark:hover:border-orange-600'
  },
  { 
    level: 3 as MoodLevel, 
    Face: OkayFace, 
    label: 'Okay',
    color: 'from-amber-400 to-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-300 dark:border-amber-800',
    hoverColor: 'hover:border-amber-400 dark:hover:border-amber-600'
  },
  { 
    level: 4 as MoodLevel, 
    Face: PrettyGoodFace, 
    label: 'Pretty Good',
    color: 'from-lime-400 to-lime-500',
    bgColor: 'bg-lime-50 dark:bg-lime-950/30',
    borderColor: 'border-lime-300 dark:border-lime-800',
    hoverColor: 'hover:border-lime-400 dark:hover:border-lime-600'
  },
  { 
    level: 5 as MoodLevel, 
    Face: GreatFace, 
    label: 'Great',
    color: 'from-emerald-400 to-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-300 dark:border-emerald-800',
    hoverColor: 'hover:border-emerald-400 dark:hover:border-emerald-600'
  }
]

/** The mood/weight APIs return this when the member has NO history at all — it
 *  is a "never logged" sentinel, not a real day count. Rendering it verbatim is
 *  how a brand-new member's first ever check-in said "999+ days since last log". */
const NEVER_LOGGED = 999

/** Warning level for days since last entry. `days >= NEVER_LOGGED` means they
 *  have simply never logged, which is not a lapse — it is their first time. */
function getWarningInfo(days: number): { level: 'none' | 'mild' | 'moderate' | 'high' | 'critical'; color: string; message: string; firstTime?: boolean } {
  if (days >= NEVER_LOGGED) {
    return { level: 'none', color: 'text-zinc-400 dark:text-zinc-500', message: 'First log', firstTime: true }
  }
  if (days >= 10) {
    return { level: 'critical', color: 'text-red-600 dark:text-red-400', message: `${days}+ days` }
  }
  if (days >= 7) {
    return { level: 'high', color: 'text-orange-600 dark:text-orange-400', message: '7 days' }
  }
  if (days >= 3) {
    return { level: 'moderate', color: 'text-amber-600 dark:text-amber-400', message: '3 days' }
  }
  if (days >= 1) {
    return { level: 'mild', color: 'text-yellow-600 dark:text-yellow-400', message: '1 day' }
  }
  return { level: 'none', color: '', message: '' }
}

export default function DailyCheckInModal({
  isOpen,
  onClose,
  daysSinceMood = 0,
  daysSinceWeight = 0,
  lastWeight,
  weightUnit = 'lbs',
  targetWeight
}: DailyCheckInModalProps) {
  const [selectedMood, setSelectedMood] = useState<MoodLevel | null>(null)
  const [weight, setWeight] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [showWarningConfirm, setShowWarningConfirm] = useState(false)
  const [pendingAction, setPendingAction] = useState<'submit' | 'skip' | null>(null)

  useLockScroll(isOpen)
  
  // Pre-fill weight once when lastWeight first loads — do not re-fill on user edits
  useEffect(() => {
    if (lastWeight) {
      setWeight(lastWeight.toString())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastWeight])
  
  const timeGreeting = useMemo(() => getTimeBasedGreeting(), [])
  
  const moodWarning = getWarningInfo(daysSinceMood)
  const weightWarning = getWarningInfo(daysSinceWeight)
  
  // Check if we should show a warning on submit/skip
  const getSkippedWarnings = () => {
    const warnings: { category: string; days: number; warning: ReturnType<typeof getWarningInfo> }[] = []
    
    if (!selectedMood && moodWarning.level !== 'none') {
      warnings.push({ category: 'Mood', days: daysSinceMood, warning: moodWarning })
    }
    if ((!weight || parseFloat(weight) <= 0) && weightWarning.level !== 'none') {
      warnings.push({ category: 'Weight', days: daysSinceWeight, warning: weightWarning })
    }
    
    return warnings
  }

  const handleSubmitAttempt = () => {
    const warnings = getSkippedWarnings()
    
    if (warnings.length > 0) {
      setPendingAction('submit')
      setShowWarningConfirm(true)
    } else {
      handleSubmit()
    }
  }

  const handleSkipAttempt = () => {
    // Show warning for both categories if skipping entirely
    const warnings: { category: string; days: number; warning: ReturnType<typeof getWarningInfo> }[] = []
    
    if (moodWarning.level !== 'none') {
      warnings.push({ category: 'Mood', days: daysSinceMood, warning: moodWarning })
    }
    if (weightWarning.level !== 'none') {
      warnings.push({ category: 'Weight', days: daysSinceWeight, warning: weightWarning })
    }
    
    if (warnings.length > 0) {
      setPendingAction('skip')
      setShowWarningConfirm(true)
    } else {
      handleSkip()
    }
  }

  const handleWarningConfirm = () => {
    setShowWarningConfirm(false)
    if (pendingAction === 'submit') {
      handleSubmit()
    } else if (pendingAction === 'skip') {
      handleSkip()
    }
    setPendingAction(null)
  }

  const handleWarningCancel = () => {
    setShowWarningConfirm(false)
    setPendingAction(null)
  }

  const handleSubmit = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // Submit mood if selected
      if (selectedMood) {
        await fetch('/api/mood', {
          method: 'POST',
          headers,
          body: JSON.stringify({ mood: selectedMood, tz: new Date().getTimezoneOffset() })
        })
      }

      // Submit weight if entered
      let goalReached: GoalReached | undefined
      if (weight && parseFloat(weight) > 0) {
        const res = await fetch('/api/weight', {
          method: 'POST',
          headers,
          body: JSON.stringify({ weight: parseFloat(weight), tz: new Date().getTimezoneOffset() })
        })
        if (res.ok) {
          const resData = await res.json().catch(() => null)
          goalReached = resData?.goalReached ?? undefined
        }
      }

      onClose({
        mood: selectedMood || undefined,
        weight: weight && parseFloat(weight) > 0 ? parseFloat(weight) : undefined,
        goalReached,
      })
    } catch (error) {
      console.error('Failed to save check-in:', error)
      onClose({
        mood: selectedMood || undefined,
        weight: weight && parseFloat(weight) > 0 ? parseFloat(weight) : undefined
      })
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // "Skip for Today" has to close the day. It used to POST {skip:true} to
      // /api/weight, which recorded nothing for mood — so the check-in was still
      // outstanding and came back after the 8-hour window, on the same day the
      // member had just dismissed it. That POST also incremented consecutiveSkips
      // on every press, so skipping three times in a day counted as three skipped
      // days against the 14-day mandatory weigh-in. /api/checkin records one skip
      // per local day and suppresses until tomorrow.
      await fetch('/api/checkin', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'skip', tz: new Date().getTimezoneOffset() })
      })

      onClose({})
    } catch (error) {
      console.error('Failed to skip check-in:', error)
      onClose({})
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const hasAnyInput = selectedMood !== null || (weight && parseFloat(weight) > 0)

  // Warning confirmation modal
  const WarningConfirmModal = () => {
    const warnings = pendingAction === 'skip' 
      ? [
          ...(moodWarning.level !== 'none' ? [{ category: 'Mood', days: daysSinceMood, warning: moodWarning }] : []),
          ...(weightWarning.level !== 'none' ? [{ category: 'Weight', days: daysSinceWeight, warning: weightWarning }] : [])
        ]
      : getSkippedWarnings()
    
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-zinc-800 rounded-xl p-5 sm:p-6 m-4 shadow-2xl max-w-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              {pendingAction === 'skip' ? 'Skip Check-in?' : 'Missing Data'}
            </h3>
          </div>
          
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            {pendingAction === 'skip' 
              ? "You haven't logged anything today. Are you sure you want to skip?"
              : "You're about to submit without filling in:"}
          </p>
          
          <div className="space-y-2 mb-5">
            {warnings.map(({ category, days, warning }) => (
              <div 
                key={category}
                className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-700/50 rounded-lg px-3 py-2"
              >
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{category}</span>
                <span className={`text-xs font-semibold ${warning.color}`}>
                  Last logged: {warning.message} ago
                </span>
              </div>
            ))}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleWarningCancel}
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-600 py-2.5 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={handleWarningConfirm}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 py-2.5 font-medium text-white transition-colors"
            >
              Continue Anyway
            </button>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 touch-none"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:p-6 max-h-[90vh] overflow-y-auto overscroll-contain touch-auto"
          >
            {/* Warning Confirmation Overlay */}
            <AnimatePresence>
              {showWarningConfirm && <WarningConfirmModal />}
            </AnimatePresence>

            {/* Header */}
            <div className="text-center mb-6">
              <div className="mb-4 flex justify-center">{timeGreeting.icon}</div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">
                {timeGreeting.greeting}
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Daily check-in — all fields optional
              </p>
            </div>

            {/* Mood Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  How are you feeling?
                </label>
                {(moodWarning.level !== 'none' || moodWarning.firstTime) && (
                  <span className={`text-xs font-medium ${moodWarning.color}`}>
                    {moodWarning.firstTime ? 'First log' : `${moodWarning.message} since last log`}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2 sm:gap-3">
                {moodOptions.map((option) => {
                  const isSelected = selectedMood === option.level
                  return (
                    <button
                      key={option.level}
                      onClick={() => setSelectedMood(isSelected ? null : option.level)}
                      className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors duration-200 sm:p-3 ${
                        isSelected
                          ? `${option.bgColor} border-zinc-900 dark:border-white`
                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                      }`}
                    >
                      <option.Face selected={isSelected} />
                      <span className={`text-[10px] font-medium sm:text-xs ${
                        isSelected
                          ? 'text-zinc-900 dark:text-white'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {option.label}
                      </span>

                      {isSelected && (
                        <motion.div
                          layoutId="moodSelection"
                          className={`absolute -bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-linear-to-r ${option.color}`}
                          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Weight Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="weight" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Current Weight ({weightUnit})
                </label>
                {(weightWarning.level !== 'none' || weightWarning.firstTime) && (
                  <span className={`text-xs font-medium ${weightWarning.color}`}>
                    {weightWarning.firstTime ? 'First log' : `${weightWarning.message} since last log`}
                  </span>
                )}
              </div>
              <input
                id="weight"
                type="number"
                step="0.1"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g., 185.5"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-center text-lg font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
              {targetWeight != null && (
                <p className="mt-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400" data-testid="checkin-goal-line">
                  {goalLine(weight, targetWeight, weightUnit)}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubmitAttempt}
                disabled={isSubmitting}
                className="w-full rounded-xl py-3 font-semibold transition-all sm:py-4 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {isSubmitting ? 'Saving...' : 'Save Check-in'}
              </button>
              
              <button
                onClick={handleSkipAttempt}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 font-semibold text-zinc-700 dark:text-zinc-300 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800 sm:py-4"
              >
                Skip for Today
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
