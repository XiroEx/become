'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Check, Dumbbell, TrendingUp, Trophy, Clock, Star, ChevronDown, BarChart2, Pencil, Trash2, X } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { BackButton } from '@/components/ui/BackButton'
import Link from 'next/link'
import { getToken } from '@/lib/clientAuth'
import type { FitnessGoal } from '@/models/User'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import TrainingLogCorrectionModal, { type EditableWorkout, type EditableWorkoutExercise } from '@/components/workout/TrainingLogCorrectionModal'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExerciseDetail extends EditableWorkoutExercise {
  name: string
  slug?: string
  bestSet: { weight: number; reps: number } | null
  volume: number
  isPR: boolean
}

interface DetailedWorkout extends Omit<EditableWorkout, 'exercises'> {
  totalVolume: number
  exercises: ExerciseDetail[]
}

interface WeekVolume {
  week: string
  volume: number
  workouts: number
}

interface PB {
  slug: string
  name: string
  weight: number
  reps: number
  date: string
}

interface ProgressData {
  weightData: Array<{ date: string; value: number }>
  bodyFatData?: Array<{ date: string; value: number }>
  leanMassData?: Array<{ date: string; value: number }>
  stats: {
    streakDays: number
    totalWorkouts: number
    thisWeekWorkouts: number
    goalProgress: number
  }
  longestStreak: number
  pbs: PB[]
  detailedWorkouts: DetailedWorkout[]
  weeklyVolume: WeekVolume[]
  totalVolumeLbs: number
  weeklyAvailability: number | null
  fitnessGoal?: FitnessGoal
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(1)}K`
  return lbs.toLocaleString()
}

// ── Volume Chart Tooltip ───────────────────────────────────────────────────────

function VolumeTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: WeekVolume }>; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="font-semibold text-zinc-900 dark:text-white">Week of {label}</p>
      {d.volume > 0
        ? <p className="text-zinc-500 dark:text-zinc-400">{fmt(d.volume)} lbs lifted</p>
        : <p className="text-zinc-500 dark:text-zinc-400">No tracked weight</p>
      }
      <p className="text-zinc-500 dark:text-zinc-400">{d.workouts} {d.workouts === 1 ? 'workout' : 'workouts'}</p>
    </div>
  )
}

// ── Workout Row (expandable) ───────────────────────────────────────────────────

function WorkoutRow({ workout, isExpanded, onToggle, onEdit }: {
  workout: DetailedWorkout
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const hasPR = workout.exercises.some((e) => e.isPR)

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <Dumbbell className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{workout.title || workout.day}</p>
            {hasPR && (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
                <Star className="h-2.5 w-2.5" /> PR
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{workout.date}</p>
        </div>
        <div className="shrink-0 text-right mr-1">
          {workout.totalVolume > 0 && (
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{fmt(workout.totalVolume)} lbs</p>
          )}
          {workout.duration && (
            <div className="flex items-center justify-end gap-0.5 text-xs text-zinc-400">
              <Clock className="h-3 w-3" />{workout.duration}m
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 dark:border-zinc-800">
              {workout.notes && (
                <div className="px-4 py-2.5 text-xs italic text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  &ldquo;{workout.notes}&rdquo;
                </div>
              )}
              {workout.exercises.length > 0 ? workout.exercises.map((ex, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-4 py-2.5 odd:bg-zinc-50/60 dark:odd:bg-zinc-800/40"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{ex.name}</p>
                    {ex.isPR && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-yellow-500">PR</span>
                    )}
                  </div>
                  {ex.bestSet ? (
                    <p className="shrink-0 text-sm font-medium text-zinc-900 dark:text-white tabular-nums">
                      {ex.bestSet.weight} × {ex.bestSet.reps}
                    </p>
                  ) : (
                    <p className="shrink-0 text-xs text-zinc-400">bodyweight</p>
                  )}
                </div>
              )) : (
                <p className="px-4 py-3 text-xs text-zinc-400">No tracked sets recorded</p>
              )}
              <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-green-800 dark:hover:bg-green-950/30 dark:hover:text-green-300"
                >
                  <Pencil className="h-3.5 w-3.5" /> Correct this workout
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── PR Chart Modal ─────────────────────────────────────────────────────────────

function PRChartModal({ pr, points, onClose, onChanged }: {
  pr: PB
  points: { date: string; weight: number; reps: number }[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const [mode, setMode] = useState<'chart' | 'edit' | 'delete'>('chart')
  const [weight, setWeight] = useState(String(pr.weight))
  const [reps, setReps] = useState(String(pr.reps))
  const [reviewing, setReviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextWeight = Number(weight)
  const nextReps = Number(reps)
  const validEdit = Number.isFinite(nextWeight) && nextWeight > 0 && Number.isInteger(nextReps) && nextReps > 0 && (nextWeight !== pr.weight || nextReps !== pr.reps)

  const save = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const token = getToken()
      const response = await fetch('/api/progress/prs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ exerciseSlug: pr.slug, weight: nextWeight, reps: nextReps }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) { setError(data.error ?? 'Could not correct this record'); setReviewing(false); return }
      await onChanged()
    } catch {
      setError('Network error — your record is unchanged')
      setReviewing(false)
    } finally { setSubmitting(false) }
  }

  const remove = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const token = getToken()
      const response = await fetch(`/api/progress/prs?exerciseSlug=${encodeURIComponent(pr.slug)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) { setError(data.error ?? 'Could not remove this record'); return }
      await onChanged()
    } catch {
      setError('Network error — your record is unchanged')
    } finally { setSubmitting(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{pr.name}</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{mode === 'chart' ? `${points.length} logged sessions` : mode === 'edit' ? 'Correct personal record' : 'Remove personal record'}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        {mode === 'chart' ? (
          <>
            {points.length < 2 ? (
              <p className="py-8 text-center text-sm text-zinc-400">Need at least 2 sessions to show a trend.</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={points} margin={{ left: -20, right: 8 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} interval="preserveStartEnd" className="text-zinc-400 dark:text-zinc-600" />
                  <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} className="text-zinc-400 dark:text-zinc-600" />
                  <Tooltip formatter={(v) => [`${v} lbs`, 'Best weight']} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                  <Line type="monotone" dataKey="weight" stroke="#18181b" strokeWidth={2} dot={{ r: 3, fill: '#18181b' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
            <div className="mt-3 flex justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
              <div className="text-center"><p className="text-xs text-zinc-400">Record</p><p className="text-sm font-bold text-green-600 dark:text-green-400">{pr.weight} lbs</p></div>
              <div className="text-center"><p className="text-xs text-zinc-400">Reps</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{pr.reps}</p></div>
              <div className="text-center"><p className="text-xs text-zinc-400">Sessions</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{points.length}</p></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setMode('edit')} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"><Pencil className="h-3.5 w-3.5" /> Correct</button>
              <button type="button" onClick={() => setMode('delete')} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
            </div>
          </>
        ) : mode === 'edit' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Weight (lb)<input type="number" inputMode="decimal" min="0" value={weight} onChange={(event) => { setWeight(event.target.value); setReviewing(false) }} className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" /></label>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Reps<input type="number" inputMode="numeric" min="1" step="1" value={reps} onChange={(event) => { setReps(event.target.value); setReviewing(false) }} className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" /></label>
            </div>
            {reviewing && validEdit && (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" /><div><p className="text-sm font-bold text-amber-900 dark:text-amber-100">Confirm record correction</p><p className="mt-1 text-sm tabular-nums text-amber-900 dark:text-amber-100"><span className="line-through opacity-60">{pr.weight} lb × {pr.reps}</span> <span aria-hidden="true">→</span> <strong>{nextWeight} lb × {nextReps}</strong></p></div></div>
              </div>
            )}
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">This corrects the displayed record. Correcting a historical workout later rebuilds records from the saved log history.</p>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <div className="flex gap-3"><button type="button" disabled={submitting} onClick={() => reviewing ? setReviewing(false) : setMode('chart')} className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">{reviewing ? 'Keep editing' : 'Back'}</button><button type="button" disabled={submitting || !validEdit} onClick={reviewing ? save : () => setReviewing(true)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${reviewing ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>{submitting ? 'Saving…' : reviewing ? <><Check className="h-4 w-4" /> Confirm & save</> : 'Review correction'}</button></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" /><div><p className="text-sm font-bold text-red-900 dark:text-red-100">Remove {pr.name} record?</p><p className="mt-1 text-xs leading-relaxed text-red-800 dark:text-red-200">The displayed {pr.weight} lb × {pr.reps} record will be removed. A future completed set can establish a new record.</p></div></div></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <div className="flex gap-3"><button type="button" disabled={submitting} onClick={() => setMode('chart')} className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">Cancel</button><button type="button" disabled={submitting} onClick={remove} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" />{submitting ? 'Removing…' : 'Yes, remove'}</button></div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Activity Calendar ──────────────────────────────────────────────────────────

function ActivityCalendar({ workouts }: { workouts: DetailedWorkout[] }) {
  const workoutDays = new Set(workouts.map(w => w.rawDate.slice(0, 10)))

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{monthLabel}</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {workouts.filter(w => w.rawDate.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`).length} workouts this month
        </p>
      </div>
      <div className="mb-1.5 grid grid-cols-7 text-center">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <span key={d} className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = day === today.getDate()
          const hasWorkout = workoutDays.has(dateStr)
          return (
            <div
              key={i}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                hasWorkout
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : isToday
                  ? 'border border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300'
                  : 'text-zinc-400 dark:text-zinc-600'
              }`}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Body Composition Chart ─────────────────────────────────────────────────────

function BodyCompChart({
  bodyFatData,
  leanMassData,
}: {
  bodyFatData: Array<{ date: string; value: number }>
  leanMassData: Array<{ date: string; value: number }>
}) {
  const [tab, setTab] = useState<'body_fat' | 'lean_mass'>('body_fat')
  const data = tab === 'body_fat' ? bodyFatData : leanMassData
  const color = tab === 'body_fat' ? '#f97316' : '#8b5cf6'
  const unit = tab === 'body_fat' ? '%' : 'lbs'
  const label = tab === 'body_fat' ? 'Body Fat' : 'Lean Mass'

  return (
    <div className="p-4">
      <div className="mb-3 flex gap-2">
        {bodyFatData.length > 0 && (
          <button
            onClick={() => setTab('body_fat')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              tab === 'body_fat'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            Body Fat %
          </button>
        )}
        {leanMassData.length > 0 && (
          <button
            onClick={() => setTab('lean_mass')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              tab === 'lean_mass'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            Lean Mass
          </button>
        )}
      </div>
      {data.length > 0 && (
        <div className="mb-3 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-zinc-900 dark:text-white">
            {data[data.length - 1].value.toFixed(1)}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{unit}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ left: -20, right: 8 }}>
          <defs>
            <linearGradient id={`bodycomp-${tab}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} interval="preserveStartEnd" className="text-zinc-400 dark:text-zinc-600" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} className="text-zinc-400 dark:text-zinc-600" />
          <Tooltip formatter={(v) => [`${v} ${unit}`, label]} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#bodycomp-${tab})`} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

const WORKOUTS_PAGE = 5
const PRS_PAGE = 6

export default function ProgressClient() {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [selectedPR, setSelectedPR] = useState<PB | null>(null)
  const [editingWorkout, setEditingWorkout] = useState<DetailedWorkout | null>(null)
  const [workoutsShown, setWorkoutsShown] = useState(WORKOUTS_PAGE)
  const [pbsShown, setPbsShown] = useState(PRS_PAGE)

  const fetchData = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    try {
      const [progressRes, profileRes] = await Promise.all([
        fetch(`/api/progress?detailed=1&tz=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (progressRes.ok) {
        const d = await progressRes.json()
        if (profileRes.ok) {
          const p = await profileRes.json()
          d.fitnessGoal = p.profile?.fitnessGoal
        }
        setData(d)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
        </div>
      </PageTransition>
    )
  }

  const hasWorkouts = (data?.detailedWorkouts?.length ?? 0) > 0
  const hasVolume = (data?.weeklyVolume ?? []).some(w => w.volume > 0)
  const weeklyGoal = data?.weeklyAvailability ?? 4

  // Build per-exercise history from detailedWorkouts for PR chart
  function getPRHistory(exerciseSlug: string) {
    if (!data?.detailedWorkouts) return []
    return data.detailedWorkouts
      .flatMap(w => {
        const ex = w.exercises.find(e => e.slug === exerciseSlug)
        if (!ex?.bestSet) return []
        return [{ date: w.date.slice(0, 6), weight: ex.bestSet.weight, reps: ex.bestSet.reps }]
      })
      .reverse()
  }

  return (
    <>
    <PageTransition className="space-y-6">

      {/* ── Header ── */}
      <header>
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Training Log</h1>
        </div>
        {data && data.stats.totalWorkouts > 0 ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {data.stats.totalWorkouts} workouts
            {data.totalVolumeLbs > 0 && <> · {fmt(data.totalVolumeLbs)} lbs lifted all-time</>}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Your full training history</p>
        )}
      </header>

      {/* ── Weekly Volume / Activity Chart ── */}
      {(data?.weeklyVolume?.length ?? 0) > 0 && (
        <div id="volume">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <BarChart2 className="h-4 w-4 text-zinc-400" />
              {hasVolume ? 'Weekly Volume' : 'Weekly Activity'}
            </h2>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">last 12 weeks</span>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-2 pb-2 pt-4 dark:border-zinc-800 dark:bg-zinc-900">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data?.weeklyVolume ?? []} barSize={20} margin={{ left: -20, right: 8 }}>
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  className="text-zinc-400 dark:text-zinc-600"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => hasVolume ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)) : String(v)}
                  className="text-zinc-400 dark:text-zinc-600"
                />
                <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar
                  dataKey={hasVolume ? 'volume' : 'workouts'}
                  radius={[4, 4, 0, 0]}
                  fill="#18181b"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Workout History ── */}
      <div id="workouts">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Workout History</h2>
          {data?.stats.thisWeekWorkouts !== undefined && (
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {data.stats.thisWeekWorkouts}/{weeklyGoal} this week
            </span>
          )}
        </div>

        {hasWorkouts ? (
          <div className="space-y-2">
            {(data?.detailedWorkouts ?? []).slice(0, workoutsShown).map((w, i) => (
              <WorkoutRow
                key={w.rawDate + i}
                workout={w}
                isExpanded={expandedIdx === i}
                onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                onEdit={() => setEditingWorkout(w)}
              />
            ))}
            {(data?.detailedWorkouts?.length ?? 0) > WORKOUTS_PAGE && (
              <button
                onClick={() => setWorkoutsShown(n => n > WORKOUTS_PAGE ? WORKOUTS_PAGE : n + WORKOUTS_PAGE)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {workoutsShown >= (data?.detailedWorkouts?.length ?? 0)
                  ? 'Show less'
                  : `Show more (${(data?.detailedWorkouts?.length ?? 0) - workoutsShown} remaining)`}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
            <Dumbbell className="mx-auto mb-3 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-4">
              No workouts logged yet. Start a program to build your history.
            </p>
            <Link
              href="/dashboard/workout#browse-programs"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Browse Programs
            </Link>
          </div>
        )}
      </div>

      {/* ── Personal Records ── */}
      {(data?.pbs?.length ?? 0) > 0 && (
        <div id="records">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Personal Records</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(data?.pbs ?? []).slice(0, pbsShown).map((pb) => (
              <button
                key={pb.slug}
                onClick={() => setSelectedPR(pb)}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{pb.name}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{pb.date} · history &amp; corrections</p>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{pb.weight} lbs</p>
                  {pb.reps > 0 && <p className="text-xs text-zinc-400">× {pb.reps} reps</p>}
                </div>
              </button>
            ))}
          </div>
          {(data?.pbs?.length ?? 0) > PRS_PAGE && (
            <button
              onClick={() => setPbsShown(n => n > PRS_PAGE ? PRS_PAGE : n + PRS_PAGE)}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {pbsShown >= (data?.pbs?.length ?? 0)
                ? 'Show less'
                : `Show more (${(data?.pbs?.length ?? 0) - pbsShown} remaining)`}
            </button>
          )}
        </div>
      )}

      {/* ── Activity Calendar ── */}
      {hasWorkouts && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-white">This Month</h2>
          <ActivityCalendar workouts={data?.detailedWorkouts ?? []} />
        </div>
      )}

      {/* ── Body Composition ── */}
      {((data?.bodyFatData?.length ?? 0) > 0 || (data?.leanMassData?.length ?? 0) > 0) && (
        <div id="body-comp">
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            Body Composition
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <BodyCompChart
              bodyFatData={data?.bodyFatData ?? []}
              leanMassData={data?.leanMassData ?? []}
            />
          </div>
        </div>
      )}

    </PageTransition>

      {/* ── PR History Modal ── */}
      <AnimatePresence>
        {selectedPR && (
          <PRChartModal
            pr={selectedPR}
            points={getPRHistory(selectedPR.slug)}
            onClose={() => setSelectedPR(null)}
            onChanged={async () => { await fetchData(); setSelectedPR(null) }}
          />
        )}
      </AnimatePresence>
      {editingWorkout && (
        <TrainingLogCorrectionModal
          workout={editingWorkout}
          onClose={() => setEditingWorkout(null)}
          onSaved={async () => { await fetchData(); setEditingWorkout(null) }}
        />
      )}
    </>
  )
}
