'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Wind,
  Target,
  Heart,
  Moon,
  Sun,
  Brain,
  Flame,
  Play,
  Pause,
  X,
  CheckCircle2,
  Clock,
  TrendingUp,
  Calendar,
} from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreathStep {
  phase: 'inhale' | 'hold-in' | 'exhale' | 'hold-out'
  label: string
  durationMs: number
}

interface Category {
  id: string
  name: string
  technique: string // e.g. "4-7-8 Method"
  tagline: string
  description: string
  bestFor: string
  Icon: React.ElementType
  colorClass: string
  bgClass: string
  playerGradient: string // inline style gradient for session overlay
  breathSteps: BreathStep[]
  durations: number[]
}

interface MeditationSession {
  _id: string
  categoryId: string
  categoryName: string
  durationMinutes: number
  completedAt: string
}

interface MeditationStats {
  totalMinutes: number
  totalSessions: number
  thisWeek: number
  streakDays: number
  meditatedToday: boolean
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: 'box',
    name: 'Box Breathing',
    technique: '4-4-4-4',
    tagline: 'Focus & Performance',
    description:
      'The technique used by Navy SEALs to stay calm under extreme pressure. Equal-length sides regulate your nervous system and sharpen focus instantly.',
    bestFor: 'Pre-workout · High-pressure moments · Mental reset',
    Icon: Target,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass:
      'bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20',
    playerGradient:
      'linear-gradient(to bottom, #2e1065, #09090b)',
    breathSteps: [
      { phase: 'inhale', label: 'Inhale', durationMs: 4000 },
      { phase: 'hold-in', label: 'Hold', durationMs: 4000 },
      { phase: 'exhale', label: 'Exhale', durationMs: 4000 },
      { phase: 'hold-out', label: 'Hold', durationMs: 4000 },
    ],
    durations: [3, 5, 10],
  },
  {
    id: 'release',
    name: '4-7-8 Breathing',
    technique: 'Dr. Weil Method',
    tagline: 'Stress Release',
    description:
      "The extended hold supercharges your blood oxygen. The long exhale fires your parasympathetic nervous system — your body's brake pedal. Proven to reduce anxiety in minutes.",
    bestFor: 'Stress & anxiety · Wind-down · Pre-sleep',
    Icon: Wind,
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass:
      'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
    playerGradient:
      'linear-gradient(to bottom, #0c1a3a, #09090b)',
    breathSteps: [
      { phase: 'inhale', label: 'Inhale', durationMs: 4000 },
      { phase: 'hold-in', label: 'Hold', durationMs: 7000 },
      { phase: 'exhale', label: 'Exhale', durationMs: 8000 },
      { phase: 'hold-out', label: 'Rest', durationMs: 1000 },
    ],
    durations: [5, 10, 15],
  },
  {
    id: 'recovery',
    name: 'Recovery Breathing',
    technique: 'Extended Exhale',
    tagline: 'Post-Workout Reset',
    description:
      'Double your exhale length to shift from fight-or-flight to rest-and-recover. Activates the vagus nerve, lowers cortisol, and accelerates muscle repair.',
    bestFor: 'After training · Cortisol reset · Active recovery',
    Icon: Heart,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass:
      'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    playerGradient:
      'linear-gradient(to bottom, #052e16, #09090b)',
    breathSteps: [
      { phase: 'inhale', label: 'Inhale', durationMs: 4000 },
      { phase: 'hold-in', label: 'Hold', durationMs: 1000 },
      { phase: 'exhale', label: 'Exhale', durationMs: 8000 },
      { phase: 'hold-out', label: 'Rest', durationMs: 1000 },
    ],
    durations: [5, 10],
  },
  {
    id: 'morning',
    name: 'Morning Activation',
    technique: 'Energizing Breath',
    tagline: 'Start with Intention',
    description:
      'Rhythmic breath work to oxygenate your blood and fire your mind before the world demands anything of you. The 2-second hold reinforces alertness without tension.',
    bestFor: 'Morning routine · Pre-coffee · Setting intentions',
    Icon: Sun,
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass:
      'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20',
    playerGradient:
      'linear-gradient(to bottom, #3d1c00, #09090b)',
    breathSteps: [
      { phase: 'inhale', label: 'Inhale', durationMs: 4000 },
      { phase: 'hold-in', label: 'Hold', durationMs: 2000 },
      { phase: 'exhale', label: 'Exhale', durationMs: 4000 },
      { phase: 'hold-out', label: 'Rest', durationMs: 500 },
    ],
    durations: [3, 5, 10],
  },
  {
    id: 'focus',
    name: 'Deep Focus',
    technique: 'Mindful Presence',
    tagline: 'Silence the Noise',
    description:
      'Anchor your awareness to breath. Each cycle quiets the mental chatter and builds your ability to sustain concentration — the foundation of peak performance.',
    bestFor: 'Work sessions · Creative flow · Mental clarity',
    Icon: Brain,
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    bgClass:
      'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/20',
    playerGradient:
      'linear-gradient(to bottom, #1e1b4b, #09090b)',
    breathSteps: [
      { phase: 'inhale', label: 'Inhale', durationMs: 5000 },
      { phase: 'hold-in', label: 'Hold', durationMs: 2000 },
      { phase: 'exhale', label: 'Exhale', durationMs: 5000 },
      { phase: 'hold-out', label: 'Hold', durationMs: 2000 },
    ],
    durations: [5, 10, 20],
  },
  {
    id: 'sleep',
    name: 'Sleep Prep',
    technique: 'Wind-Down Protocol',
    tagline: 'Enter Deep Recovery',
    description:
      'Long exhales activate your parasympathetic system and signal your body to drop core temperature. Drift into the deep recovery sleep your muscles need to grow.',
    bestFor: 'Before bed · Post-evening training · Full recovery',
    Icon: Moon,
    colorClass: 'text-rose-600 dark:text-rose-400',
    bgClass:
      'bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20',
    playerGradient:
      'linear-gradient(to bottom, #1a0010, #09090b)',
    breathSteps: [
      { phase: 'inhale', label: 'Inhale', durationMs: 5000 },
      { phase: 'hold-in', label: 'Hold', durationMs: 3000 },
      { phase: 'exhale', label: 'Exhale', durationMs: 7000 },
      { phase: 'hold-out', label: 'Rest', durationMs: 1000 },
    ],
    durations: [10, 15, 20],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getRecommendedCategory(): Category {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) return CATEGORIES.find((c) => c.id === 'morning')!
  if (hour >= 11 && hour < 17) return CATEGORIES.find((c) => c.id === 'box')!
  if (hour >= 17 && hour < 21) return CATEGORIES.find((c) => c.id === 'recovery')!
  return CATEGORIES.find((c) => c.id === 'sleep')!
}

// ─── Stat Card (matches dashboard quick-stats style) ─────────────────────────

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  value,
  label,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  value: string | number
  label: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-3 sm:p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg} sm:h-10 sm:w-10`}>
        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-zinc-900 dark:text-white sm:text-xl">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
    </div>
  )
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  onSelect,
  completedToday,
}: {
  cat: Category
  onSelect: (cat: Category) => void
  completedToday: boolean
}) {
  const { Icon, colorClass, bgClass } = cat
  return (
    <button
      onClick={() => onSelect(cat)}
      className="group relative flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all active:scale-[0.98]"
    >
      {completedToday && (
        <span className="absolute right-3 top-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </span>
      )}
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${bgClass}`}>
        <Icon className={`h-5 w-5 ${colorClass}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">
          {cat.name}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{cat.tagline}</p>
        <p className="mt-0.5 text-xs font-mono text-zinc-400 dark:text-zinc-500">{cat.technique}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {cat.durations.map((d) => (
          <span
            key={d}
            className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400"
          >
            {d}m
          </span>
        ))}
      </div>
    </button>
  )
}

// ─── Session Picker (category detail + duration) ──────────────────────────────

function SessionPicker({
  cat,
  onStart,
  onBack,
}: {
  cat: Category
  onStart: (cat: Category, duration: number) => void
  onBack: () => void
}) {
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null)
  const { Icon, colorClass, bgClass } = cat

  const pattern = cat.breathSteps
    .filter((s) => s.durationMs > 0)
    .map((s) => s.durationMs / 1000)
    .join('-')

  return (
    <div className="space-y-4">
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
      >
        <span>←</span> All practices
      </button>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        {/* Category header */}
        <div className="mb-5 flex items-start gap-4">
          <div className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${bgClass}`}>
            <Icon className={`h-6 w-6 ${colorClass}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{cat.name}</h3>
            <p className={`text-sm font-medium ${colorClass}`}>{cat.tagline}</p>
            <p className="mt-0.5 font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {cat.technique} · {pattern}s pattern
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="mb-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {cat.description}
        </p>

        {/* Best for */}
        <div className="mb-5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
            Best for
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{cat.bestFor}</p>
        </div>

        {/* Duration picker */}
        <div>
          <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">
            Choose duration
          </p>
          <div className="flex gap-2">
            {cat.durations.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDuration(d)}
                className={`flex-1 rounded-xl border-2 py-3 text-sm font-semibold transition-all ${
                  selectedDuration === d
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500'
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={() => selectedDuration && onStart(cat, selectedDuration)}
          disabled={!selectedDuration}
          className={`mt-4 w-full rounded-xl py-3.5 text-sm font-bold transition-all ${
            selectedDuration
              ? 'bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 active:scale-[0.98]'
              : 'cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
          }`}
        >
          Begin Session
        </button>
      </div>
    </div>
  )
}

// ─── Audio + Haptic helpers ───────────────────────────────────────────────────

// Soft chime on each phase transition — pentatonic pitches feel meditative
const PHASE_FREQ: Record<string, number> = {
  inhale: 392,    // G4 — warm, rising
  'hold-in': 440, // A4 — steady
  exhale: 294,    // D4 — descending, releasing
  'hold-out': 247, // B3 — rest
}

function playPhaseChime(phase: string) {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(PHASE_FREQ[phase] ?? 440, ctx.currentTime)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.08)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => ctx.close()
  } catch { /* audio not available */ }
}

function haptic(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

// ─── Session Player ───────────────────────────────────────────────────────────

const RADIUS = 86
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function SessionPlayer({
  cat,
  durationMinutes,
  onComplete,
  onAbandon,
}: {
  cat: Category
  durationMinutes: number
  onComplete: () => void
  onAbandon: () => void
}) {
  const totalSeconds = durationMinutes * 60
  const [timeLeft, setTimeLeft] = useState(totalSeconds)
  const [isPaused, setIsPaused] = useState(false)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [phaseProgress, setPhaseProgress] = useState(0) // 0→1 within current step

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const breathRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Play chime + haptic when a phase starts (phaseIdx changes)
  const prevPhaseRef = useRef<number>(-1)
  useEffect(() => {
    if (isPaused) return
    if (phaseIdx !== prevPhaseRef.current) {
      prevPhaseRef.current = phaseIdx
      const phase = cat.breathSteps[phaseIdx].phase
      playPhaseChime(phase)
      haptic(35)
    }
  }, [phaseIdx, isPaused, cat.breathSteps])

  // Countdown
  useEffect(() => {
    if (isPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          haptic([100, 60, 100]) // completion pattern
          onComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isPaused, onComplete])

  // Breath cycle
  useEffect(() => {
    if (isPaused) return
    const step = cat.breathSteps[phaseIdx]
    const tickMs = 50
    const steps = step.durationMs / tickMs
    let tick = 0

    breathRef.current = setInterval(() => {
      tick++
      setPhaseProgress(tick / steps)
      if (tick >= steps) {
        clearInterval(breathRef.current!)
        setPhaseIdx((prev) => (prev + 1) % cat.breathSteps.length)
        setPhaseProgress(0)
      }
    }, tickMs)

    return () => { if (breathRef.current) clearInterval(breathRef.current) }
  }, [isPaused, phaseIdx, cat.breathSteps])

  const currentStep = cat.breathSteps[phaseIdx]

  // Orb scale
  let orbScale = 0.62
  if (currentStep.phase === 'inhale') orbScale = 0.62 + phaseProgress * 0.38
  else if (currentStep.phase === 'hold-in') orbScale = 1.0
  else if (currentStep.phase === 'exhale') orbScale = 1.0 - phaseProgress * 0.38
  // hold-out: 0.62

  const overallProgress = 1 - timeLeft / totalSeconds
  const strokeDashoffset = CIRCUMFERENCE * (1 - overallProgress)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: cat.playerGradient }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
            {cat.name}
          </p>
          <p className="text-sm text-white/60">{durationMinutes} min · {cat.technique}</p>
        </div>
        <button
          onClick={onAbandon}
          className="rounded-full p-2 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        {/* Orb + SVG ring */}
        <div className="relative flex h-56 w-56 items-center justify-center">
          {/* Timer ring */}
          <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90 h-full w-full">
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke="white"
              strokeWidth="1.5"
              strokeOpacity="0.12"
            />
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke="white"
              strokeWidth="1.5"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>

          {/* Ambient glow */}
          <div
            className="absolute inset-8 rounded-full bg-white/20 blur-2xl"
            style={{
              transform: `scale(${orbScale})`,
              transition: 'transform 50ms linear',
            }}
          />

          {/* Orb */}
          <div
            className="relative flex h-32 w-32 flex-col items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm"
            style={{
              transform: `scale(${orbScale})`,
              transition: 'transform 50ms linear',
            }}
          >
            <span className="font-mono text-3xl font-bold text-white">
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        {/* Phase label */}
        <div className="text-center">
          <p className="text-3xl font-bold uppercase tracking-[0.2em] text-white">
            {isPaused ? 'Paused' : currentStep.label}
          </p>
          <p className="mt-2 text-sm text-white/40">
            {isPaused ? 'Tap resume to continue' : cat.tagline}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex flex-col items-center gap-5 px-6 py-10"
        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => setIsPaused((p) => !p)}
          className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/15 hover:bg-white/25 transition-colors active:scale-95"
        >
          {isPaused ? (
            <Play className="h-7 w-7 text-white" />
          ) : (
            <Pause className="h-7 w-7 text-white" />
          )}
        </button>
        <button
          onClick={onAbandon}
          className="text-sm text-white/30 hover:text-white/60 transition-colors"
        >
          End session
        </button>
      </div>
    </div>
  )
}

// ─── Session Complete ─────────────────────────────────────────────────────────

function SessionComplete({
  cat,
  durationMinutes,
  stats,
  onDone,
  onAnother,
}: {
  cat: Category
  durationMinutes: number
  stats: MeditationStats | null
  onDone: () => void
  onAnother: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Session Complete</h2>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          {durationMinutes} min · {cat.name}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Your nervous system is thanking you. Consistency here compounds — every session trains your mind to find calm faster.
        </p>
      </div>

      {/* Updated stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-center">
            <Flame className="mx-auto mb-1 h-4 w-4 text-orange-400" />
            <p className="text-xl font-bold text-zinc-900 dark:text-white">{stats.streakDays}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">day streak</p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-center">
            <Clock className="mx-auto mb-1 h-4 w-4 text-blue-400" />
            <p className="text-xl font-bold text-zinc-900 dark:text-white">
              {formatMinutes(stats.totalMinutes)}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">total time</p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-center">
            <TrendingUp className="mx-auto mb-1 h-4 w-4 text-violet-400" />
            <p className="text-xl font-bold text-zinc-900 dark:text-white">{stats.totalSessions}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">sessions</p>
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-3">
        <button
          onClick={onAnother}
          className="w-full rounded-xl bg-zinc-900 py-3.5 text-sm font-bold text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 transition-all active:scale-[0.98]"
        >
          Start Another Session
        </button>
        <button
          onClick={onDone}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 py-3.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
        >
          Done for now
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type View = 'browse' | 'pick' | 'session' | 'complete'

export default function MeditationTab() {
  const [view, setView] = useState<View>('browse')
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [selectedDuration, setSelectedDuration] = useState<number>(5)
  const [sessions, setSessions] = useState<MeditationSession[]>([])
  const [stats, setStats] = useState<MeditationStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    try {
      const res = await fetch('/api/meditation', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setSessions(data.sessions ?? [])
      setStats(data.stats ?? null)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSessionComplete = useCallback(async () => {
    if (!selectedCat) return
    const token = getToken()
    if (token) {
      try {
        await fetch('/api/meditation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            categoryId: selectedCat.id,
            categoryName: selectedCat.name,
            durationMinutes: selectedDuration,
          }),
        })
        await fetchData() // refresh stats
      } catch { /* silent */ }
    }
    setView('complete')
  }, [selectedCat, selectedDuration, fetchData])

  const recommendation = getRecommendedCategory()
  const todayStr = new Date().toISOString().slice(0, 10)
  const completedTodayIds = new Set(
    sessions
      .filter((s) => s.completedAt.slice(0, 10) === todayStr)
      .map((s) => s.categoryId),
  )

  // Session player
  if (view === 'session' && selectedCat) {
    return (
      <SessionPlayer
        cat={selectedCat}
        durationMinutes={selectedDuration}
        onComplete={handleSessionComplete}
        onAbandon={() => setView('browse')}
      />
    )
  }

  // Session complete
  if (view === 'complete' && selectedCat) {
    return (
      <SessionComplete
        cat={selectedCat}
        durationMinutes={selectedDuration}
        stats={stats}
        onDone={() => { setView('browse'); setSelectedCat(null) }}
        onAnother={() => setView('pick')}
      />
    )
  }

  // Session picker (category detail)
  if (view === 'pick' && selectedCat) {
    return (
      <SessionPicker
        cat={selectedCat}
        onStart={(cat, duration) => {
          setSelectedCat(cat)
          setSelectedDuration(duration)
          setView('session')
        }}
        onBack={() => setView('browse')}
      />
    )
  }

  // Browse view
  return (
    <div className="space-y-5">
      {/* Stats — 2×2 on mobile, 4 across on sm+ — matches dashboard style */}
      {!loading && stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatCard
            icon={Flame}
            iconBg={stats.streakDays > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-zinc-100 dark:bg-zinc-800'}
            iconColor={stats.streakDays > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-zinc-400 dark:text-zinc-600'}
            value={stats.streakDays}
            label="Meditation Streak"
          />
          <StatCard
            icon={Clock}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-500 dark:text-blue-400"
            value={formatMinutes(stats.totalMinutes)}
            label="Mind Time"
          />
          <StatCard
            icon={Calendar}
            iconBg="bg-indigo-100 dark:bg-indigo-900/30"
            iconColor="text-indigo-500 dark:text-indigo-400"
            value={stats.thisWeek}
            label="This Week"
          />
          <StatCard
            icon={TrendingUp}
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconColor="text-violet-500 dark:text-violet-400"
            value={stats.totalSessions}
            label="Sessions"
          />
        </div>
      )}
      {loading && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      )}

      {/* Recommended */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Recommended now
        </p>
        <button
          onClick={() => { setSelectedCat(recommendation); setView('pick') }}
          className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all active:scale-[0.99]"
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${recommendation.bgClass}`}>
              <recommendation.Icon className={`h-5 w-5 ${recommendation.colorClass}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-zinc-900 dark:text-white">{recommendation.name}</p>
                {completedTodayIds.has(recommendation.id) && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{recommendation.tagline} · {recommendation.technique}</p>
              <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed line-clamp-2">
                {recommendation.description}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* All practices */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          All practices
        </p>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              onSelect={(c) => { setSelectedCat(c); setView('pick') }}
              completedToday={completedTodayIds.has(cat.id)}
            />
          ))}
        </div>
      </div>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Recent sessions
          </p>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            {sessions.slice(0, 7).map((s) => (
              <div key={s._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{s.categoryName}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatDate(s.completedAt)}</p>
                </div>
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  {s.durationMinutes}m
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
