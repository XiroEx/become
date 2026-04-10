'use client'

import { useState, useEffect } from 'react'
import { Zap, Wind, Target, BookOpen, Shield, Flame } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'

interface StateOption {
  id: MindState
  label: string
  emoji: string
  color: string
  border: string
  bg: string
}

const STATES: StateOption[] = [
  { id: 'stressed', label: 'Stressed', emoji: '😤', color: 'text-red-500', border: 'border-red-500/40', bg: 'bg-red-500/10' },
  { id: 'distracted', label: 'Distracted', emoji: '🌀', color: 'text-yellow-500', border: 'border-yellow-500/40', bg: 'bg-yellow-500/10' },
  { id: 'low_energy', label: 'Low Energy', emoji: '😴', color: 'text-blue-400', border: 'border-blue-400/40', bg: 'bg-blue-400/10' },
  { id: 'locked_in', label: 'Locked In', emoji: '🔒', color: 'text-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
]

const TAB_ICONS: Record<string, React.ElementType> = {
  'state-shift': Wind,
  'mission': BookOpen,
  'home': Zap,
}

interface Recommendation {
  action: string
  tab: string
  message: string
}

interface StateLog {
  state: MindState
  timestamp: string
}

interface Props {
  onNavigateTab?: (tab: string) => void
  streak?: number
}

export default function HomeTab({ onNavigateTab, streak = 0 }: Props) {
  const [selected, setSelected] = useState<MindState | null>(null)
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null)
  const [history, setHistory] = useState<StateLog[]>([])
  const [logging, setLogging] = useState(false)
  const [missionPulse, setMissionPulse] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) return

    const headers = { Authorization: `Bearer ${token}` }

    fetch('/api/mind/state', { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.logs) setHistory(data.logs) })
      .catch(() => {})

    fetch('/api/mind/mission', { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.mission?.dailyAction) setMissionPulse(data.mission.dailyAction) })
      .catch(() => {})
  }, [])

  async function handleStateSelect(state: MindState) {
    setSelected(state)
    setLogging(true)
    try {
      const token = getToken()
      const res = await fetch('/api/mind/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state }),
      })
      if (res.ok) {
        const data = await res.json()
        setRecommendation(data.recommendation)
        setHistory((prev) => [data.log, ...prev].slice(0, 7))
      }
    } finally {
      setLogging(false)
    }
  }

  const stateHistory7 = history.slice(0, 7)

  return (
    <div className="space-y-5">
      {/* State check-in */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          How are you right now?
        </p>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-500">
          Be honest. Your next move depends on it.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {STATES.map((s) => (
            <button
              key={s.id}
              onClick={() => handleStateSelect(s.id)}
              disabled={logging}
              className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-left transition-all ${
                selected === s.id
                  ? `${s.border} ${s.bg}`
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <span className="text-xl">{s.emoji}</span>
              <span className={`text-sm font-semibold ${selected === s.id ? s.color : 'text-zinc-700 dark:text-zinc-300'}`}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      {recommendation && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Next Move
          </p>
          <p className="mb-3 text-base font-semibold text-white">{recommendation.action}</p>
          <p className="mb-4 text-sm leading-relaxed text-zinc-400">{recommendation.message}</p>
          {recommendation.tab !== 'home' && onNavigateTab && (
            <button
              onClick={() => onNavigateTab(recommendation.tab)}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-opacity hover:opacity-90"
            >
              {(() => {
                const Icon = TAB_ICONS[recommendation.tab] ?? Target
                return <Icon className="h-4 w-4" />
              })()}
              Go to {recommendation.action}
            </button>
          )}
        </div>
      )}

      {/* Identity bar */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Identity Bar
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" />
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{streak}</p>
              <p className="text-xs text-zinc-500">day streak</p>
            </div>
          </div>
          {missionPulse && (
            <div className="max-w-[60%] text-right">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">
                Today&apos;s Action
              </p>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-snug">
                {missionPulse}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent state history */}
      {stateHistory7.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Recent States
          </p>
          <div className="flex gap-2 flex-wrap">
            {stateHistory7.map((log, i) => {
              const s = STATES.find((x) => x.id === log.state)
              if (!s) return null
              return (
                <span
                  key={i}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${s.border} ${s.bg} ${s.color}`}
                >
                  {s.emoji} {s.label}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
