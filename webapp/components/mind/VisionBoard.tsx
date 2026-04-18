'use client'

import { useState } from 'react'
import { Edit2, Sparkles, Flame } from 'lucide-react'
import { motion } from 'framer-motion'
import { getToken } from '@/lib/clientAuth'

interface VisionData {
  habits: string
  mind: string
  body: string
  relationships: string
  environment: string
  identityStatement: string
  alignmentHistory?: { date: string; score: number }[]
}

const DIMENSIONS = [
  { key: 'habits' as const,       label: 'Habits',        color: 'text-blue-400',   border: 'border-blue-500/20',   bg: 'bg-blue-500/5' },
  { key: 'mind' as const,         label: 'Mind',          color: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/5' },
  { key: 'body' as const,         label: 'Body',          color: 'text-emerald-400',border: 'border-emerald-500/20',bg: 'bg-emerald-500/5' },
  { key: 'relationships' as const,label: 'Relationships', color: 'text-amber-400',  border: 'border-amber-500/20',  bg: 'bg-amber-500/5' },
  { key: 'environment' as const,  label: 'Environment',   color: 'text-red-400',    border: 'border-red-500/20',    bg: 'bg-red-500/5' },
]

const PULSE_LABELS = ['Off track', 'Struggling', 'Holding', 'Aligned', 'In flow']

interface Props {
  vision: VisionData
  streak?: number
  onEdit: () => void
}

export default function VisionBoard({ vision, streak = 0, onEdit }: Props) {
  const [pulseSaving, setPulseSaving] = useState(false)
  const [todayPulse, setTodayPulse] = useState<number | null>(() => {
    const today = new Date().toISOString().split('T')[0]
    return vision.alignmentHistory?.find(e => e.date === today)?.score ?? null
  })

  async function logPulse(score: number) {
    setTodayPulse(score)
    setPulseSaving(true)
    try {
      const token = getToken()
      await fetch('/api/mind/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pulse: score }),
      })
    } finally {
      setPulseSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Identity Statement — hero */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-800 dark:border-zinc-700 p-5">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 to-transparent pointer-events-none" />
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400/80">Your Vision</p>
          </div>
          <div className="flex items-center gap-3">
            {streak > 0 && (
              <div className="flex items-center gap-1">
                <Flame className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-bold text-orange-400">{streak}d</span>
              </div>
            )}
            <button
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="text-base font-bold text-white leading-snug">
          I am the kind of person who {vision.identityStatement || '...'}
        </p>
      </div>

      {/* Vision Pulse */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Vision Pulse · Today
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          How aligned are you with your vision right now?
        </p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              onClick={() => logPulse(score)}
              disabled={pulseSaving}
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
                todayPulse === score
                  ? 'bg-amber-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {score}
            </button>
          ))}
        </div>
        {todayPulse && (
          <p className="mt-2 text-center text-xs text-zinc-400">{PULSE_LABELS[todayPulse - 1]}</p>
        )}
      </div>

      {/* Dimension panels */}
      {DIMENSIONS.map((d, i) => (
        <motion.div
          key={d.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`rounded-2xl border ${d.border} ${d.bg} p-4`}
        >
          <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${d.color}`}>{d.label}</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            {vision[d.key] || <span className="italic text-zinc-400">Not yet set</span>}
          </p>
        </motion.div>
      ))}
    </div>
  )
}
