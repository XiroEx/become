'use client'

// State-check scene — the opening move. Tap how you feel; we map it to one of
// the 4 canonical states (for logging + breath selection), grant XP server-side
// via /api/mind/state, and reveal a tailored line. 20 nuanced options so users
// aren't boxed in, plus a "something else" escape. Renders inside the player's
// black full-screen stage.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CloudRain, CloudLightning, Layers, Flame, Angry,
  Waves, Shuffle, Wind, CloudFog, Meh,
  BatteryLow, Moon, BatteryWarning, CloudOff, Frown,
  Target, Leaf, Rocket, Zap, Heart,
  ArrowRight, type LucideIcon,
} from 'lucide-react'
import type { MindState } from '@/lib/mindContent'
import type { SceneProps } from '@/lib/mind/moves'

const TINT: Record<MindState, string> = {
  stressed: 'text-red-300',
  distracted: 'text-amber-300',
  low_energy: 'text-blue-300',
  locked_in: 'text-green-300',
}

// 20 feelings, each mapped to a canonical state. Order interleaves so the grid
// reads as a spectrum rather than four labeled blocks.
const FEELINGS: { label: string; value: MindState; Icon: LucideIcon }[] = [
  { label: 'Stressed', value: 'stressed', Icon: CloudRain },
  { label: 'Distracted', value: 'distracted', Icon: Waves },
  { label: 'Low energy', value: 'low_energy', Icon: BatteryLow },
  { label: 'Locked in', value: 'locked_in', Icon: Target },
  { label: 'Anxious', value: 'stressed', Icon: CloudLightning },
  { label: 'Scattered', value: 'distracted', Icon: Shuffle },
  { label: 'Tired', value: 'low_energy', Icon: Moon },
  { label: 'Calm', value: 'locked_in', Icon: Leaf },
  { label: 'Overwhelmed', value: 'stressed', Icon: Layers },
  { label: 'Restless', value: 'distracted', Icon: Wind },
  { label: 'Drained', value: 'low_energy', Icon: BatteryWarning },
  { label: 'Motivated', value: 'locked_in', Icon: Rocket },
  { label: 'Frustrated', value: 'stressed', Icon: Flame },
  { label: 'Foggy', value: 'distracted', Icon: CloudFog },
  { label: 'Unmotivated', value: 'low_energy', Icon: CloudOff },
  { label: 'Energized', value: 'locked_in', Icon: Zap },
  { label: 'Angry', value: 'stressed', Icon: Angry },
  { label: 'Bored', value: 'distracted', Icon: Meh },
  { label: 'Down', value: 'low_energy', Icon: Frown },
  { label: 'Grateful', value: 'locked_in', Icon: Heart },
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

  const pickOther = () => {
    if (chosen || other) return
    setOther(true)
    setMessage("That's okay — you don't have to name it. Let's just begin.")
  }

  const pick = async (state: MindState) => {
    if (chosen || other) return
    setChosen(state)
    onState?.(state)
    setMessage(FALLBACK_MESSAGES[state]) // optimistic
    try {
      const res = await fetch('/api/mind/state', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ state }),
      })
      if (res.ok) {
        const data = (await res.json()) as { recommendation?: { message?: string } }
        if (data.recommendation?.message) setMessage(data.recommendation.message)
      }
    } catch {
      /* keep fallback */
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <AnimatePresence mode="wait">
        {!chosen && !other ? (
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
