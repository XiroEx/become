'use client'

// State-check scene — the opening move. Tap your current state; we log it
// (grants XP server-side via /api/mind/state) and reveal a tailored line, then
// continue. Renders inside the player's black full-screen stage.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CloudRain, Waves, BatteryLow, Target, ArrowRight } from 'lucide-react'
import type { MindState } from '@/lib/mindContent'
import type { SceneProps } from '@/lib/mind/moves'

const STATES: { value: MindState; label: string; Icon: typeof CloudRain; tint: string; ring: string }[] = [
  { value: 'stressed', label: 'Stressed', Icon: CloudRain, tint: 'text-red-300', ring: 'hover:border-red-400/60' },
  { value: 'distracted', label: 'Distracted', Icon: Waves, tint: 'text-amber-300', ring: 'hover:border-amber-400/60' },
  { value: 'low_energy', label: 'Low energy', Icon: BatteryLow, tint: 'text-blue-300', ring: 'hover:border-blue-400/60' },
  { value: 'locked_in', label: 'Locked in', Icon: Target, tint: 'text-green-300', ring: 'hover:border-green-400/60' },
]

const FALLBACK_MESSAGES: Record<MindState, string> = {
  stressed: "Noticing it is the first move. Let's bring the system down a notch.",
  distracted: "The scatter is normal. We'll pull the focus back to one point.",
  low_energy: "Low is data, not destiny. A little input changes the output.",
  locked_in: "This is the state champions live in. Let's protect it.",
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
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <AnimatePresence mode="wait">
        {!chosen && !other ? (
          <motion.div
            key="pick"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full max-w-sm flex-col items-center"
          >
            <h1 className="text-2xl font-extrabold">{move.title}</h1>
            {move.subtitle && <p className="mt-2 text-white/50">{move.subtitle}</p>}
            <div className="mt-8 grid w-full grid-cols-2 gap-3">
              {STATES.map(({ value, label, Icon, tint, ring }) => (
                <button
                  key={value}
                  onClick={() => pick(value)}
                  className={`flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 transition-colors active:scale-95 ${ring}`}
                >
                  <Icon className={`h-8 w-8 ${tint}`} />
                  <span className="text-sm font-semibold text-white/90">{label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={pickOther}
              className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70"
            >
              Something else / not sure
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full max-w-sm flex-col items-center"
          >
            <p className="text-xs uppercase tracking-widest text-white/40">Noted</p>
            <p className="mt-4 text-xl font-semibold leading-relaxed text-white/90">{message}</p>
            <button
              onClick={onDone}
              className="mt-10 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
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
