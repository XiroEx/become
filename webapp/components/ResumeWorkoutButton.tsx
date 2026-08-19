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
// Wiring: GET /api/workouts/in-progress → the open log itself.
//
// It used to derive the workout from the ENROLMENT instead: read
// /api/programs/active, take the first in-progress program, then ask
// /api/workouts for that program's `currentDay`. That missed two real cases,
// and the pill simply never appeared:
//
//   1. WRONG DAY. The enrolment's currentDay had advanced to 'Day 5' while the
//      workout actually open was 'Day 1'. The lookup asked about a day with no
//      open log and concluded there was nothing to resume. This is what was
//      reported — mid-workout, no pill.
//   2. NO ENROLMENT. An open log can belong to a program the member is not
//      currently enrolled in, and the old path bailed before ever reading it.
//
// The open LOG is the source of truth for "you are mid-workout". Asking it
// directly removes both failure modes and one of the two round trips.

interface ResumeState {
  /** Where tapping it goes. */
  href: string
  /** What to call it: the program day, or the session's own title. */
  label: string
}

export default function ResumeWorkoutButton() {
  const [resume, setResume] = useState<ResumeState | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) return

        const tz = new Date().getTimezoneOffset()
        const res = await fetch(`/api/workouts/in-progress?tz=${tz}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          workout?: {
            kind?: 'program' | 'quick'
            programId: string | null
            day: string | null
            sessionId?: string | null
            title?: string | null
          } | null
        }
        if (cancelled) return

        const w = data.workout
        if (w?.kind === 'quick' && w.sessionId) {
          // A session you built yourself resumes the same way a program does.
          setResume({
            href: `/dashboard/workout/quick/workout/live?session=${encodeURIComponent(w.sessionId)}`,
            label: w.title || 'Quick session',
          })
        } else if (w?.programId && w.day) {
          setResume({
            href: `/dashboard/workout/${encodeURIComponent(w.programId)}/workout/live?day=${encodeURIComponent(w.day)}`,
            label: w.day,
          })
        } else {
          setResume(null)
        }
      } catch {
        /* silent — don't pollute the dashboard with errors */
      }
    }
    check()

    // Re-check when the tab is brought back to the front. Someone finishing a
    // workout in another tab, or returning after backgrounding the PWA, should
    // not be shown a stale pill — and someone who STARTED one should get it.
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!resume) return null

  const href = resume.href

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 p-4 shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.01] active:scale-[0.99] dark:from-emerald-600 dark:via-green-600 dark:to-teal-600"
        aria-label={`Get back into ${resume.label}`}
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
              Active · {resume.label}
            </div>
            <div className="truncate text-base font-bold text-white">
              Get back into the workout
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
