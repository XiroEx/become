'use client'

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

type StartingPoint = 'lost' | 'stuck' | 'building' | 'leveling_up'
type PrimaryObstacle = 'clarity' | 'discipline' | 'motivation' | 'environment'

interface Props {
  onComplete: () => void
}

// ─── Step 1 data ───────────────────────────────────────────────────────────────

const STARTING_POINTS: { id: StartingPoint; headline: string; sub: string; emoji: string }[] = [
  {
    id: 'lost',
    headline: "I feel lost",
    sub: "No clear direction. Just know something has to change.",
    emoji: '🌫',
  },
  {
    id: 'stuck',
    headline: "I know what I want but I'm stuck",
    sub: "The vision is there. The execution keeps breaking down.",
    emoji: '🔒',
  },
  {
    id: 'building',
    headline: "I'm building momentum",
    sub: "Making progress but need a real system behind it.",
    emoji: '🔥',
  },
  {
    id: 'leveling_up',
    headline: "I'm ready to go to the next level",
    sub: "Already moving. Need to sharpen everything.",
    emoji: '⚡',
  },
]

// ─── Step 3 data ───────────────────────────────────────────────────────────────

const OBSTACLES: { id: PrimaryObstacle; headline: string; sub: string }[] = [
  {
    id: 'clarity',
    headline: "No clear direction",
    sub: "I don't fully know what I want or why I want it.",
  },
  {
    id: 'discipline',
    headline: "Can't stay consistent",
    sub: "I start strong and fall off. The habits don't stick.",
  },
  {
    id: 'motivation',
    headline: "My mindset crashes",
    sub: "Doubt, fear, and low energy knock me off course.",
  },
  {
    id: 'environment',
    headline: "My environment pulls me back",
    sub: "The people or situation around me work against me.",
  },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export default function IdentityOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1)
  const [startingPoint, setStartingPoint] = useState<StartingPoint | null>(null)
  const [futureSelf, setFutureSelf] = useState('')
  const [obstacle, setObstacle] = useState<PrimaryObstacle | null>(null)
  const [saving, setSaving] = useState(false)

  // Derive currentSelf from startingPoint for the API
  const currentSelfMap: Record<StartingPoint, string> = {
    lost: 'I feel lost — no clear direction, just know something has to change.',
    stuck: "I know what I want but I keep getting stuck — the execution breaks down.",
    building: "I'm building momentum but need a real system behind it.",
    leveling_up: "I'm already moving and ready to go to the next level.",
  }

  async function submit() {
    if (!startingPoint || !futureSelf.trim() || !obstacle) return
    setSaving(true)
    try {
      const token = getToken()
      const res = await fetch('/api/mind/identity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          currentSelf: currentSelfMap[startingPoint],
          futureSelf: futureSelf.trim(),
          primaryObstacle: obstacle,
          startingPoint,
        }),
      })
      if (res.ok) onComplete()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-[60vh]">

      {/* Progress bar */}
      <div className="mb-8 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              n <= step ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-800'
            }`}
          />
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Step 1 of 3
          </p>
          <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white leading-tight">
            Be honest with yourself.
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Where are you right now? Not where you want to be — where you actually are.
          </p>
          <div className="space-y-3">
            {STARTING_POINTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setStartingPoint(s.id)}
                className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
                  startingPoint === s.id
                    ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <span className="text-2xl leading-none mt-0.5">{s.emoji}</span>
                <div>
                  <p className={`text-sm font-bold leading-tight ${
                    startingPoint === s.id ? 'text-white dark:text-zinc-900' : 'text-zinc-900 dark:text-white'
                  }`}>
                    {s.headline}
                  </p>
                  <p className={`mt-1 text-xs leading-snug ${
                    startingPoint === s.id ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {s.sub}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!startingPoint}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white py-4 text-sm font-bold text-white dark:text-zinc-900 disabled:opacity-30 transition-opacity"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Step 2 of 3
          </p>
          <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white leading-tight">
            Who are you becoming?
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Not what you want to have — who you want to <em>be</em>. Write it like it&apos;s already happening.
          </p>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1 mb-4">
            <textarea
              value={futureSelf}
              onChange={(e) => setFutureSelf(e.target.value)}
              placeholder="I am becoming someone who..."
              rows={5}
              maxLength={500}
              autoFocus
              className="w-full resize-none rounded-xl bg-transparent px-4 py-4 text-base text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none leading-relaxed"
            />
          </div>
          <p className="mb-6 text-xs text-zinc-400 text-right">{futureSelf.length}/500</p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 px-5 py-4 text-sm font-semibold text-zinc-500 dark:text-zinc-400"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={futureSelf.trim().length < 10}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white py-4 text-sm font-bold text-white dark:text-zinc-900 disabled:opacity-30 transition-opacity"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Step 3 of 3
          </p>
          <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white leading-tight">
            What&apos;s your biggest obstacle?
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Be real. This determines where the system focuses your energy first.
          </p>
          <div className="space-y-3">
            {OBSTACLES.map((o) => (
              <button
                key={o.id}
                onClick={() => setObstacle(o.id)}
                className={`flex w-full flex-col gap-1 rounded-2xl border p-4 text-left transition-all ${
                  obstacle === o.id
                    ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <p className={`text-sm font-bold ${
                  obstacle === o.id ? 'text-white dark:text-zinc-900' : 'text-zinc-900 dark:text-white'
                }`}>
                  {o.headline}
                </p>
                <p className={`text-xs leading-snug ${
                  obstacle === o.id ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
                }`}>
                  {o.sub}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 px-5 py-4 text-sm font-semibold text-zinc-500 dark:text-zinc-400"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={!obstacle || saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white py-4 text-sm font-bold text-white dark:text-zinc-900 disabled:opacity-30 transition-opacity"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Building your system...</>
              ) : (
                <>Build my system <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
