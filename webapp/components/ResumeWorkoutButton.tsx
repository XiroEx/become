'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import ConfirmModal from '@/components/workout/ConfirmModal'
import { clearQuickSession } from '@/lib/quickSession/store'

// Shows ONLY when the user has an in-progress workout log started within the
// last 24h (rolling, not the calendar day — see IN_PROGRESS_WINDOW_MS) and
// not yet completed. Disappears the moment the workout is marked complete.
// Sits between the dashboard tile grid and the "Up Next" card — and,
// rendered a second time, at the top of the workout section, so it's
// reachable from wherever a member actually is.
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
//
// Hold-to-delete: holding the pill deletes the open log outright (program via
// DELETE /api/workouts, quick via the existing DELETE /api/workouts/session).
// It is a hard delete, not a skip — the day goes back to exactly the state it
// was in before the workout was opened, on the dashboard, the workout
// section, and the calendar alike, since all three read the same log.

interface ResumeState {
  /** Where tapping it goes. */
  href: string
  /** What to call it: the program day, or the session's own title. */
  label: string
  kind: 'program' | 'quick'
  programId: string | null
  day: string | null
  sessionId: string | null
}

const HOLD_MS = 550
const MOVE_CANCEL_PX = 10

export default function ResumeWorkoutButton({ className }: { className?: string }) {
  const [resume, setResume] = useState<ResumeState | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressFiredRef = useRef(false)

  const check = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (!token) { setResume(null); return }

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

      const w = data.workout
      if (w?.kind === 'quick' && w.sessionId) {
        // A session you built yourself resumes the same way a program does.
        setResume({
          href: `/dashboard/workout/quick/workout/live?session=${encodeURIComponent(w.sessionId)}`,
          label: w.title || 'Quick session',
          kind: 'quick',
          programId: null,
          day: null,
          sessionId: w.sessionId,
        })
      } else if (w?.programId && w.day) {
        setResume({
          href: `/dashboard/workout/${encodeURIComponent(w.programId)}/workout/live?day=${encodeURIComponent(w.day)}`,
          label: w.day,
          kind: 'program',
          programId: w.programId,
          day: w.day,
          sessionId: null,
        })
      } else {
        setResume(null)
      }
    } catch {
      /* silent — don't pollute the dashboard with errors */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = () => { if (!cancelled) check() }
    run()

    // Re-check when the tab is brought back to the front. Someone finishing a
    // workout in another tab, or returning after backgrounding the PWA, should
    // not be shown a stale pill — and someone who STARTED one should get it.
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return // primary button / touch only
    pressStartRef.current = { x: e.clientX, y: e.clientY }
    longPressFiredRef.current = false
    clearHoldTimer()
    holdTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      try { navigator.vibrate?.(20) } catch { /* not everywhere */ }
      setConfirmOpen(true)
    }, HOLD_MS)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = pressStartRef.current
    if (!start || !holdTimerRef.current) return
    // A real scroll/drag cancels the hold; a few pixels of jitter does not,
    // or the gesture would be impossible to land with a thumb.
    if (Math.abs(e.clientX - start.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - start.y) > MOVE_CANCEL_PX) {
      clearHoldTimer()
    }
  }

  const cancelPress = () => clearHoldTimer()

  const handleClick = (e: React.MouseEvent) => {
    if (longPressFiredRef.current) {
      // The hold already opened the delete confirmation — don't also navigate.
      e.preventDefault()
      longPressFiredRef.current = false
    }
  }

  const handleConfirmDelete = useCallback(async () => {
    if (!resume || deleting) return
    setDeleting(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      if (resume.kind === 'quick' && resume.sessionId) {
        await fetch(`/api/workouts/session?id=${encodeURIComponent(resume.sessionId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        clearQuickSession(resume.sessionId)
      } else if (resume.kind === 'program' && resume.programId && resume.day) {
        const tz = new Date().getTimezoneOffset()
        await fetch(
          `/api/workouts?programId=${encodeURIComponent(resume.programId)}&day=${encodeURIComponent(resume.day)}&tz=${tz}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        )
        // The live view restores unsaved progress from this key on load — leaving
        // it behind would resurrect the deleted workout the next time this
        // program+day is opened.
        try { localStorage.removeItem(`live_draft_${resume.programId}_${resume.day}`) } catch { /* ignore */ }
      }
    } catch {
      /* silent — re-check below re-syncs regardless of outcome */
    } finally {
      setDeleting(false)
      setConfirmOpen(false)
      // Trust the server, not an optimistic clear — this is the same source
      // GET/in-progress reads, so re-checking is what keeps the dashboard,
      // the workout section, and (on next visit) the calendar in agreement.
      check()
    }
  }, [resume, deleting, check])

  return (
    <>
      {resume && (
        <motion.div
          className={className}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        >
          <Link
            href={resume.href}
            className="group relative block touch-pan-y select-none overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 p-4 shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.01] active:scale-[0.99] dark:from-emerald-600 dark:via-green-600 dark:to-teal-600"
            aria-label={`Get back into ${resume.label}. Hold to delete this workout.`}
            data-testid="resume-workout-button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
            onPointerLeave={cancelPress}
            onClick={handleClick}
            onContextMenu={(e) => e.preventDefault()}
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
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Delete this workout?"
        body="This removes the in-progress workout completely — on the dashboard, in the workout section, and on the calendar. This can't be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete workout'}
        cancelLabel="Keep it"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
