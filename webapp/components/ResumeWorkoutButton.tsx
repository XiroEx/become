'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'

// Shows ONLY when the user has an in-progress workout log for today
// (started but not yet completed). Disappears the moment the workout is
// marked complete. Sits between the dashboard tile grid and the
// "Up Next" card.
//
// Wiring:
//   1. GET /api/programs/active → pick the first 'in-progress' program
//   2. GET /api/workouts?programId=X&day=Y&tz=... → if isResume === true
//      AND the workout is not completed, render the pill.
//   3. CTA → /dashboard/programming/<id>/workout/live?day=<dayLabel>

interface ActiveProgram {
  programId: string
  programName: string
  currentDay: string
  currentPhase: number
  status?: string
}

interface ResumeState {
  programId: string
  programName: string
  day: string
  workoutTitle?: string
}

export default function ResumeWorkoutButton() {
  const [resume, setResume] = useState<ResumeState | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) return

        // 1) Find the user's primary in-progress program
        const activeRes = await fetch('/api/programs/active', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!activeRes.ok) return
        const activeData = (await activeRes.json()) as { activePrograms?: ActiveProgram[] }
        const program = (activeData.activePrograms || []).find(
          (p) => p.status === 'in-progress' || p.status === 'active' || !p.status,
        )
        if (!program) return

        // 2) Ask the workouts API if today has an in-progress log for it
        const tz = new Date().getTimezoneOffset()
        const wkRes = await fetch(
          `/api/workouts?programId=${encodeURIComponent(program.programId)}&day=${encodeURIComponent(program.currentDay)}&tz=${tz}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!wkRes.ok) return
        const wkData = (await wkRes.json()) as {
          workout?: { completed?: boolean }
          isResume?: boolean
        }
        if (cancelled) return

        // Only show while the workout is still open (started but not done)
        if (wkData.isResume && wkData.workout && !wkData.workout.completed) {
          setResume({
            programId: program.programId,
            programName: program.programName,
            day: program.currentDay,
          })
        } else {
          setResume(null)
        }
      } catch {
        /* silent — don't pollute the dashboard with errors */
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  if (!resume) return null

  const href = `/dashboard/programming/${encodeURIComponent(resume.programId)}/workout/live?day=${encodeURIComponent(resume.day)}`

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 p-4 shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.01] active:scale-[0.99] dark:from-emerald-600 dark:via-green-600 dark:to-teal-600"
        aria-label={`Get back into ${resume.day} workout`}
      >
        {/* Animated shine sweeping across — gives it the "pop / live" feel */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.6 }}
        />

        <div className="relative flex items-center gap-3">
          {/* Pulsing live dot */}
          <span aria-hidden className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/80">
              Active · {resume.day}
            </div>
            <div className="truncate text-base font-bold text-white">
              Get back into the workout
            </div>
            <div className="truncate text-xs text-white/80">
              {resume.programName}
            </div>
          </div>

          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white shadow-inner backdrop-blur-sm transition-transform group-hover:translate-x-0.5">
            <Play className="h-5 w-5 fill-white" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}
