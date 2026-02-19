"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '@/components/PageTransition'
import { ChevronLeft, ChevronRight, Calendar, Check } from 'lucide-react'

interface Props {
  programId: string
  programName: string
  trainingDaysPerWeek: number
  durationWeeks: number
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Suggest sensible default training days based on count
function suggestTrainingDays(count: number): number[] {
  const suggestions: Record<number, number[]> = {
    1: [1],              // Mon
    2: [1, 4],           // Mon, Thu
    3: [1, 3, 5],        // Mon, Wed, Fri
    4: [1, 2, 4, 5],     // Mon, Tue, Thu, Fri
    5: [1, 2, 3, 4, 5],  // Mon-Fri
    6: [1, 2, 3, 4, 5, 6], // Mon-Sat
    7: [0, 1, 2, 3, 4, 5, 6], // Every day
  }
  return suggestions[count] || suggestions[4]
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function toISODateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface ExistingSchedule {
  settings: { trainingDays: number[]; startDate: string; autoAdvance: boolean }
  scheduledWorkouts: Array<{ date: string; dayLabel: string; workoutTitle: string; status: string }>
  programName: string
}

export default function ScheduleSetupClient({ programId, programName, trainingDaysPerWeek, durationWeeks }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'loading' | 'create' | 'view'>('loading')
  const [existingSchedule, setExistingSchedule] = useState<ExistingSchedule | null>(null)
  const [step, setStep] = useState(1)
  const [selectedDays, setSelectedDays] = useState<number[]>(suggestTrainingDays(trainingDaysPerWeek))
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    // Default to next Monday
    const day = tomorrow.getDay()
    const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day
    const nextMonday = new Date(tomorrow)
    nextMonday.setDate(tomorrow.getDate() + daysUntilMonday)
    return nextMonday
  })
  const [previewWeeks, setPreviewWeeks] = useState<Array<{ date: Date; dayLabel: string; title: string }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Check for existing schedule on mount
  useEffect(() => {
    const checkExisting = async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) { setMode('create'); return }
        const res = await fetch(`/api/schedule?programId=${programId}&view=all`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const match = data.schedules?.find((s: ExistingSchedule & { programId: string }) => s.programId === programId)
          if (match) {
            setExistingSchedule(match)
            setSelectedDays(match.settings.trainingDays)
            setStartDate(new Date(match.settings.startDate))
            setMode('view')
            return
          }
        }
      } catch { /* ignore */ }
      setMode('create')
    }
    checkExisting()
  }, [programId])

  // Generate preview of first 2 weeks
  const generatePreview = useCallback(() => {
    if (selectedDays.length === 0) return

    const sorted = [...selectedDays].sort((a, b) => a - b)
    const preview: Array<{ date: Date; dayLabel: string; title: string }> = []
    const current = new Date(startDate)
    current.setHours(0, 0, 0, 0)
    
    const endPreview = new Date(current)
    endPreview.setDate(endPreview.getDate() + 14) // 2 weeks preview
    
    let dayCount = 1
    while (current < endPreview) {
      if (sorted.includes(current.getDay())) {
        preview.push({
          date: new Date(current),
          dayLabel: `Day ${dayCount}`,
          title: `Training Day ${dayCount}`,
        })
        dayCount++
      }
      current.setDate(current.getDate() + 1)
    }
    
    setPreviewWeeks(preview)
  }, [selectedDays, startDate])

  useEffect(() => {
    if (step === 3) {
      generatePreview()
    }
  }, [step, generatePreview])

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day) 
        : [...prev, day].sort((a, b) => a - b)
    )
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          programId,
          trainingDays: selectedDays,
          startDate: toISODateString(startDate),
        }),
      })

      if (res.ok) {
        router.push(`/dashboard/programming/${programId}`)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to create schedule')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    router.push(`/dashboard/programming/${programId}`)
  }

  const handleRecreate = () => {
    setExistingSchedule(null)
    setStep(1)
    setMode('create')
  }

  if (mode === 'loading') {
    return (
      <PageTransition className="min-h-screen pb-24">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
        </div>
      </PageTransition>
    )
  }

  // VIEW MODE: Show existing schedule summary
  if (mode === 'view' && existingSchedule) {
    const upcoming = existingSchedule.scheduledWorkouts
      .filter((w) => new Date(w.date) >= new Date() && w.status === 'scheduled')
      .slice(0, 5)
    const completed = existingSchedule.scheduledWorkouts.filter((w) => w.status === 'completed').length
    const total = existingSchedule.scheduledWorkouts.length

    return (
      <PageTransition className="min-h-screen pb-24">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="mb-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">Your Schedule</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{programName}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Completed</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-white">{completed}/{total}</p>
          </div>
          <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Training Days</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-white">{existingSchedule.settings.trainingDays.map(d => DAY_LABELS[d]).join(', ')}</p>
          </div>
          <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Start Date</p>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">{new Date(existingSchedule.settings.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Upcoming workouts */}
        {upcoming.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">Upcoming Workouts</h2>
            <div className="space-y-2">
              {upcoming.map((w, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    {new Date(w.date).getDate()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{w.dayLabel}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(w.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <a
            href="/dashboard/calendar"
            className="block w-full rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            View Full Calendar
          </a>
          <a
            href="/dashboard/calendar/settings"
            className="block w-full rounded-xl border border-zinc-200 px-4 py-3 text-center text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Edit Training Days
          </a>
          <button
            onClick={handleRecreate}
            className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Recreate Schedule
          </button>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="min-h-screen pb-24">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => step > 1 ? setStep(step - 1) : router.back()}
          className="mb-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ChevronLeft className="h-4 w-4" />
          {step > 1 ? 'Back' : 'Skip Setup'}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">Set Up Schedule</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{programName}</p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
              s < step ? 'bg-green-500 text-white' : s === step ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
            }`}>
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 3 && (
              <div className={`h-0.5 flex-1 rounded-full transition-colors ${s < step ? 'bg-green-500' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Pick Training Days */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">Which days do you want to train?</h2>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              This program has {trainingDaysPerWeek} training days per week. Select your preferred days.
            </p>

            <div className="mb-6 grid grid-cols-7 gap-2">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all ${
                    selectedDays.includes(idx)
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>

            <div className="mb-6 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800/50">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-900 dark:text-white">{selectedDays.length}</span> days selected
                {selectedDays.length !== trainingDaysPerWeek && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                    (program recommends {trainingDaysPerWeek})
                  </span>
                )}
              </p>
              {selectedDays.length > 0 && (
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedDays.map(d => DAY_FULL_LABELS[d]).join(', ')}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Skip for Now
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={selectedDays.length === 0}
                className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Next
                <ChevronRight className="ml-1 inline h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Pick Start Date */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">When do you want to start?</h2>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              Pick a start date for your {durationWeeks}-week program.
            </p>

            <div className="mb-6">
              <input
                type="date"
                value={toISODateString(startDate)}
                min={toISODateString(new Date())}
                onChange={(e) => setStartDate(new Date(e.target.value + 'T00:00:00'))}
                className="box-border w-full max-w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              />
            </div>

            <div className="mb-6 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800/50">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Starting <span className="font-semibold text-zinc-900 dark:text-white">{formatDate(startDate)}</span>
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {(() => {
                  const endDate = new Date(startDate)
                  endDate.setDate(endDate.getDate() + durationWeeks * 7)
                  return `Estimated completion: ${formatDate(endDate)}`
                })()}
              </p>
            </div>

            <button
              onClick={() => setStep(3)}
              className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Preview Schedule
              <ChevronRight className="ml-1 inline h-4 w-4" />
            </button>
          </motion.div>
        )}

        {/* Step 3: Preview & Confirm */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">Preview Your Schedule</h2>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              Here&apos;s how your first 2 weeks will look. You can always adjust later.
            </p>

            <div className="mb-6 space-y-2">
              {previewWeeks.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    {item.date.getDate()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{item.dayLabel}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {isSubmitting ? 'Creating Schedule...' : 'Confirm Schedule'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
