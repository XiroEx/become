'use client'

// State-check scene — the opening move.
//  • First run (or no recent check-in): tap how you feel from 20 nuanced
//    options → mapped to one of 4 canonical states, logged via /api/mind/state
//    (grants XP), with a tailored reveal. "Something else" escape included.
//  • Supplementary run (you checked in within the last few hours): a lightweight
//    "Welcome back" opener — pick up with your last state in one tap (no
//    re-logging / no XP spam), or "I'm feeling different" to re-check.
// Renders inside the player's black full-screen stage.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CloudRain, CloudLightning, Layers, Flame, Angry,
  Waves, Shuffle, Wind, CloudFog, Meh,
  BatteryLow, Moon, BatteryWarning, CloudOff, Frown,
  Target, Leaf, Rocket, Zap, Heart,
  ArrowRight, RotateCcw, Loader2, type LucideIcon,
} from 'lucide-react'
import type { MindState } from '@/lib/mindContent'
import type { SceneProps } from '@/lib/mind/moves'

// Within this window of your last check-in, a new session skips the full grid.
const RECENT_WINDOW_MS = 4 * 60 * 60 * 1000

const TINT: Record<MindState, string> = {
  stressed: 'text-red-300',
  distracted: 'text-amber-300',
  low_energy: 'text-blue-300',
  locked_in: 'text-green-300',
}

// Canonical per-state meta for the "welcome back" opener.
const STATE_META: Record<MindState, { label: string; Icon: LucideIcon }> = {
  stressed: { label: 'stressed', Icon: CloudRain },
  distracted: { label: 'distracted', Icon: Waves },
  low_energy: { label: 'low energy', Icon: BatteryLow },
  locked_in: { label: 'locked in', Icon: Target },
}

// 20 feelings, each mapped to a canonical state. Ordered by color as a spectrum
// from green (best / locked-in) → blue (low) → amber (distracted) → red.
const FEELINGS: { label: string; value: MindState; Icon: LucideIcon }[] = [
  { label: 'Locked in', value: 'locked_in', Icon: Target },
  { label: 'Energized', value: 'locked_in', Icon: Zap },
  { label: 'Motivated', value: 'locked_in', Icon: Rocket },
  { label: 'Calm', value: 'locked_in', Icon: Leaf },
  { label: 'Grateful', value: 'locked_in', Icon: Heart },
  { label: 'Low energy', value: 'low_energy', Icon: BatteryLow },
  { label: 'Tired', value: 'low_energy', Icon: Moon },
  { label: 'Drained', value: 'low_energy', Icon: BatteryWarning },
  { label: 'Unmotivated', value: 'low_energy', Icon: CloudOff },
  { label: 'Down', value: 'low_energy', Icon: Frown },
  { label: 'Distracted', value: 'distracted', Icon: Waves },
  { label: 'Scattered', value: 'distracted', Icon: Shuffle },
  { label: 'Restless', value: 'distracted', Icon: Wind },
  { label: 'Foggy', value: 'distracted', Icon: CloudFog },
  { label: 'Bored', value: 'distracted', Icon: Meh },
  { label: 'Stressed', value: 'stressed', Icon: CloudRain },
  { label: 'Anxious', value: 'stressed', Icon: CloudLightning },
  { label: 'Overwhelmed', value: 'stressed', Icon: Layers },
  { label: 'Frustrated', value: 'stressed', Icon: Flame },
  { label: 'Angry', value: 'stressed', Icon: Angry },
]

const FALLBACK_MESSAGES: Record<MindState, string> = {
  stressed: "Noticing it is the first move. Let's bring the system down a notch.",
  distracted: "The scatter is normal. We'll pull the focus back to one point.",
  low_energy: 'Low is data, not destiny. A little input changes the output.',
  locked_in: "This is the state to protect. Let's pour into it.",
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function StateCheckScene({ move, onState, onDone }: SceneProps) {
  const [chosen, setChosen] = useState<MindState | null>(null)
  const [other, setOther] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Supplementary-run state.
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [recent, setRecent] = useState<MindState | null>(null)
  const [recheck, setRecheck] = useState(false)
  // Re-check that changed state → capture "what changed?".
  const [pendingState, setPendingState] = useState<MindState | null>(null)
  const [note, setNote] = useState('')

  // Look for a recent check-in to decide between the full grid and the quick opener.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/mind/state', { headers: authHeaders() })
        if (res.ok) {
          const data = (await res.json()) as { logs?: { state: MindState; timestamp: string }[] }
          const last = data.logs?.[0]
          if (last && Date.now() - new Date(last.timestamp).getTime() < RECENT_WINDOW_MS) {
            if (!cancelled) setRecent(last.state)
          }
        }
      } catch {
        /* no recent → full grid */
      } finally {
        if (!cancelled) setLoadingRecent(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const pickOther = () => {
    if (chosen || other) return
    setOther(true)
    setMessage("That's okay — you don't have to name it. Let's just begin.")
  }

  // Quick path: reuse the recent state, no re-logging (avoids mood/XP spam).
  const resumeRecent = () => {
    if (!recent) return
    onState?.(recent)
    onDone()
  }

  const submitState = async (state: MindState, opts?: { note?: string; previousState?: MindState }) => {
    setChosen(state)
    setPendingState(null) // clear the "what changed?" gate so the reveal can show
    onState?.(state)
    setMessage(FALLBACK_MESSAGES[state]) // optimistic
    try {
      const res = await fetch('/api/mind/state', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          state,
          ...(opts?.note && { note: opts.note }),
          ...(opts?.previousState && { previousState: opts.previousState }),
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { recommendation?: { message?: string } }
        if (data.recommendation?.message) setMessage(data.recommendation.message)
      }
    } catch {
      /* keep fallback */
    }
  }

  const pick = (state: MindState) => {
    if (chosen || other || pendingState) return
    // Re-check that actually changed the state → ask what changed first.
    if (recheck && recent && state !== recent) {
      setPendingState(state)
      return
    }
    void submitState(state)
  }

  const submitNote = () => {
    if (!pendingState) return
    void submitState(pendingState, { note: note.trim() || undefined, previousState: recent ?? undefined })
  }

  const showOpener = !chosen && !other && !recheck && !pendingState && recent !== null

  return (
    <div className="flex h-full w-full flex-col">
      <AnimatePresence mode="wait">
        {loadingRecent && !chosen && !other ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </motion.div>
        ) : showOpener && recent ? (
          // ── Supplementary "welcome back" opener ──
          <motion.div
            key="opener"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
          >
            <span className={`mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5`}>
              {(() => { const I = STATE_META[recent].Icon; return <I className={`h-8 w-8 ${TINT[recent]}`} /> })()}
            </span>
            <h1 className="text-2xl font-extrabold">Welcome back</h1>
            <p className="mt-2 max-w-xs text-white/50">
              Last check-in: <span className="font-semibold text-white/80">{STATE_META[recent].label}</span>. Pick up where you left off?
            </p>
            <button
              onClick={resumeRecent}
              className="mt-9 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              Let&apos;s go
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => setRecheck(true)}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-white/50 transition-colors hover:text-white/80"
            >
              <RotateCcw className="h-4 w-4" />
              I&apos;m feeling different
            </button>
          </motion.div>
        ) : pendingState ? (
          // ── "What changed?" (state changed on a re-check) ──
          <motion.div
            key="note"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
          >
            <p className="text-xs uppercase tracking-widest text-white/40">
              {recent ? `${STATE_META[recent].label} → ` : ''}{STATE_META[pendingState].label}
            </p>
            <h1 className="mt-3 text-2xl font-extrabold">What changed?</h1>
            <p className="mt-2 max-w-xs text-white/50">A quick note on what shifted since earlier.</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={3}
              placeholder="e.g. wrapped a hard call, hit the gym, bad news…"
              className="mt-6 w-full max-w-sm resize-none rounded-2xl border border-white/15 bg-white/5 p-4 text-center text-base text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
            />
            <button
              onClick={submitNote}
              className="mt-6 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => void submitState(pendingState)}
              className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70"
            >
              Skip
            </button>
          </motion.div>
        ) : !chosen && !other ? (
          // ── Full grid (first run / re-check) ──
          <motion.div
            key="pick"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full w-full flex-col overflow-y-auto px-6 py-8"
          >
            <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
              <h1 className="text-center text-2xl font-extrabold">{move.title}</h1>
              {move.subtitle && <p className="mt-2 text-center text-white/50">{move.subtitle}</p>}
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                {FEELINGS.map(({ label, value, Icon }) => (
                  <button
                    key={label}
                    onClick={() => pick(value)}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-4 transition-colors hover:border-white/30 active:scale-95"
                  >
                    <Icon className={`h-6 w-6 ${TINT[value]}`} />
                    <span className="text-xs font-semibold text-white/90">{label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={pickOther}
                className="mt-4 py-1 text-center text-sm font-medium text-white/40 transition-colors hover:text-white/70"
              >
                Something else / not sure
              </button>
            </div>
          </motion.div>
        ) : (
          // ── Reveal ──
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
          >
            <p className="text-xs uppercase tracking-widest text-white/40">Noted</p>
            <p className="mt-4 max-w-sm text-xl font-semibold leading-relaxed text-white/90">{message}</p>
            <button
              onClick={onDone}
              className="mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
