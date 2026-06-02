'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Award, Dumbbell, Flame, Rocket, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'

// ─── Constants ────────────────────────────────────────────────────────────────

export const WORKOUT_QUOTES = [
  "Every rep is a vote for the person you want to become.",
  "You didn't come this far to only come this far.",
  "The pain you feel today is the strength you feel tomorrow.",
  "Discipline is choosing what you want most over what you want now.",
  "Champions aren't made in gyms. They're made from what they have deep inside.",
  "Small daily improvements are the key to staggering long-term results.",
  "You showed up. That's the hardest part.",
  "Consistency beats intensity every single time.",
  "Become who you were meant to be — one session at a time.",
  "The body achieves what the mind believes.",
  "Results happen over time, not overnight. Work hard, stay consistent, be patient.",
  "Be stronger than your strongest excuse.",
]

export const GOAL_CLOSINGS: Record<string, string> = {
  lose_weight: "Every session is burning closer to the best version of you. Keep showing up.",
  gain_muscle: "Those micro-tears are building something greater. Recover hard, come back stronger.",
  maintain: "Consistency is its own kind of strength. You showed up — that's the whole game.",
  improve_performance: "Another session logged. Another step toward elite. The work is compounding.",
  general_health: "Your future self is grateful you did this today. Keep stacking those wins.",
}

export function getDayOfYear(): number {
  const now = new Date()
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SummaryProps {
  programCompleted: boolean
  completedProgramName: string
  programId?: string
  workout: { day: string; title: string } | null
  elapsedTime: number
  exerciseData: { reps: string; weight: string; completed: boolean }[][]
  exercises: { name: string }[]
  exerciseHistory: Record<string, { weight: number; reps: number; duration?: number; date: string }>
  summaryStreak: { streakDays: number; nextMilestone: number | null } | null
  summaryGoal: string | null
  formatTime: (s: number) => string
  onDone: () => void
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

export function ConfettiBurst() {
  const particles = useMemo(() => {
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#06b6d4', '#84cc16']
    return Array.from({ length: 22 }, (_, i) => {
      const angle = (i / 22) * Math.PI * 2
      const distance = 80 + (i % 4) * 40
      return {
        id: i,
        color: colors[i % colors.length],
        x: Math.cos(angle) * distance * (0.7 + (i % 3) * 0.2),
        y: Math.sin(angle) * distance * 0.8 - 60,
        size: 5 + (i % 4) * 3,
        isCircle: i % 3 !== 0,
        delay: (i % 5) * 0.05,
      }
    })
  }, [])

  return (
    <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: p.delay }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.isCircle ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  )
}

// ─── WorkoutSummary ───────────────────────────────────────────────────────────

export default function WorkoutSummary({
  programCompleted, completedProgramName, programId, workout,
  elapsedTime, exerciseData, exercises, exerciseHistory,
  summaryStreak, summaryGoal, formatTime, onDone,
}: SummaryProps) {
  const quote = WORKOUT_QUOTES[getDayOfYear() % WORKOUT_QUOTES.length]

  // Compute PRs
  const newPRs = exercises.map((exercise, exIdx) => {
    const sets = exerciseData[exIdx] || []
    const activeSets = sets.filter(s => s.completed && !(s.reps === "0" && s.weight === "0"))
    const history = exerciseHistory[exercise.name]
    if (!history || activeSets.length === 0) return null
    const bestSet = activeSets.reduce((best, s) => {
      const w = parseFloat(s.weight) || 0, r = parseInt(s.reps) || 0
      const bw = parseFloat(best.weight) || 0, br = parseInt(best.reps) || 0
      return w > bw || (w === bw && r > br) ? s : best
    }, activeSets[0])
    const isPR = (parseFloat(bestSet.weight) || 0) > history.weight ||
      ((parseFloat(bestSet.weight) || 0) === history.weight && (parseInt(bestSet.reps) || 0) > history.reps)
    return isPR ? { name: exercise.name, bestSet, history } : null
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  const totalSets = exerciseData.reduce((sum, sets) => sum + sets.filter(s => s.completed).length, 0)
  const totalVolume = Math.round(exerciseData.reduce((sum, sets) =>
    sum + sets.reduce((ss, s) => s.completed ? ss + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0) : ss, 0), 0))

  const closingMessage = summaryGoal ? GOAL_CLOSINGS[summaryGoal] : GOAL_CLOSINGS.general_health

  const streakProgress = summaryStreak?.nextMilestone
    ? Math.min((summaryStreak.streakDays / summaryStreak.nextMilestone) * 100, 100)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
      }}
    >
      <ConfettiBurst />

      <div className="flex-1 space-y-5 px-5 py-4">

        {/* Hero header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
          className="pb-2 pt-6 text-center"
        >
          {programCompleted ? (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 18 }}
                className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-yellow-500/15 ring-4 ring-yellow-500/30 dark:bg-yellow-500/20"
              >
                <Trophy className="h-12 w-12 text-yellow-500 dark:text-yellow-400" strokeWidth={1.5} />
              </motion.div>
              <h1 className="text-4xl font-black tracking-tight text-yellow-600 dark:text-yellow-400">PROGRAM COMPLETE</h1>
              <p className="mt-2 text-lg font-semibold text-zinc-700 dark:text-zinc-300">{completedProgramName || workout?.title}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">You finished every single workout. That&apos;s elite.</p>
            </>
          ) : (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 18 }}
                className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/30 dark:bg-emerald-500/20"
              >
                {newPRs.length > 0
                  ? <Award className="h-12 w-12 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                  : <Dumbbell className="h-12 w-12 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                }
              </motion.div>
              <h1 className="text-4xl font-black tracking-tight">
                {newPRs.length > 0 ? 'YOU CRUSHED IT' : 'WORKOUT DONE'}
              </h1>
              <p className="mt-1.5 font-medium text-zinc-600 dark:text-zinc-400">{workout?.day} — {workout?.title}</p>
              {newPRs.length > 0 && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <Trophy className="h-3.5 w-3.5" />
                  {newPRs.length} new personal record{newPRs.length > 1 ? 's' : ''} today
                </p>
              )}
            </>
          )}
          <p className="mt-4 px-4 text-sm italic leading-relaxed text-zinc-500 dark:text-zinc-500">&ldquo;{quote}&rdquo;</p>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-3 gap-2"
        >
          <Card variant="compact" className="text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatTime(elapsedTime)}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Duration</p>
          </Card>
          <Card variant="compact" className="text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalSets}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Sets</p>
          </Card>
          <Card variant="compact" className="text-center">
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{totalVolume.toLocaleString()}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Volume lbs</p>
          </Card>
        </motion.div>

        {/* Streak card */}
        {summaryStreak !== null && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 }}
          >
            <Card variant="default">
              <div className="mb-3 flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.18, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Flame className="h-7 w-7 text-orange-500" strokeWidth={1.5} />
                </motion.div>
                <div>
                  <p className="text-lg font-bold leading-none text-zinc-900 dark:text-white">{summaryStreak.streakDays} day streak</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {summaryStreak.streakDays === 1
                      ? "The streak starts here. Don't break it."
                      : summaryStreak.streakDays < 7
                      ? "Building momentum. Keep it going."
                      : summaryStreak.streakDays < 30
                      ? "You're on fire. Stay consistent."
                      : "Elite consistency. Legendary work."}
                  </p>
                </div>
              </div>
              {summaryStreak.nextMilestone && (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${streakProgress}%` }}
                      transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-500">
                    {summaryStreak.streakDays} / {summaryStreak.nextMilestone} days to next milestone
                  </p>
                </>
              )}
            </Card>
          </motion.div>
        )}

        {/* PR highlights */}
        {newPRs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card
              variant="default"
              className="border-yellow-500/30 bg-yellow-500/10 dark:border-yellow-500/30 dark:bg-yellow-500/10"
            >
              <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-yellow-700 dark:text-yellow-400">
                <Trophy className="h-3.5 w-3.5" /> New Personal Records
              </p>
              <div className="space-y-2">
                {newPRs.map((pr, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white">{pr.name}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400">
                        {parseFloat(pr.bestSet.weight) > 0
                          ? `${pr.bestSet.weight} × ${pr.bestSet.reps}`
                          : `${pr.bestSet.reps} reps`}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-500">
                        prev {pr.history.weight > 0
                          ? `${pr.history.weight} × ${pr.history.reps}`
                          : `${pr.history.reps} reps`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Exercise breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.58 }}
        >
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-500">Exercise Breakdown</p>
          <div className="space-y-2">
            {exercises.map((exercise, exIdx) => {
              const sets = exerciseData[exIdx] || []
              const activeSets = sets.filter(s => s.completed && !(s.reps === "0" && s.weight === "0"))
              const skipped = sets.filter(s => s.completed && s.reps === "0" && s.weight === "0").length
              const isPR = newPRs.some(pr => pr.name === exercise.name)
              return (
                <Card key={exIdx} variant="compact">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{exercise.name}</h3>
                      {isPR && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400">
                          <Trophy className="h-3 w-3" /> PR
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {activeSets.length}/{sets.length} sets{skipped > 0 ? ` (${skipped} skipped)` : ''}
                    </span>
                  </div>
                  {activeSets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeSets.map((s, i) => (
                        <span key={i} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {parseFloat(s.weight) > 0 ? `${s.weight}×${s.reps}` : `${s.reps} reps`}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </motion.div>

        {/* Closing message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <Card variant="default" className="text-center">
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{closingMessage}</p>
          </Card>
        </motion.div>

      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75 }}
        className="space-y-2 px-5 pt-2"
      >
        <button
          onClick={onDone}
          className={`w-full rounded-xl py-4 text-base font-bold shadow-sm transition-all active:scale-95 ${
            programCompleted
              ? "bg-yellow-500 text-zinc-950 shadow-yellow-500/20 hover:bg-yellow-400"
              : "bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            {programCompleted
              ? <><Rocket className="h-5 w-5" /> Find My Next Challenge</>
              : <><Dumbbell className="h-5 w-5" /> I&apos;ll Be Back</>
            }
          </span>
        </button>
        {programCompleted && programId ? (
          <Link
            href={`/dashboard/workout/${programId}/journey`}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-yellow-500/40 py-3.5 text-sm font-semibold text-yellow-700 transition-all hover:border-yellow-500/70 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300"
          >
            <Trophy className="h-4 w-4" /> See Your Full Journey
          </Link>
        ) : (
          <Link
            href="/dashboard/progress#workouts"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-3.5 text-sm font-semibold text-zinc-700 transition-all hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white"
          >
            <TrendingUp className="h-4 w-4" /> View Training Log
          </Link>
        )}
      </motion.div>
    </motion.div>
  )
}
