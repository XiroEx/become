'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, MessageSquare, Thermometer, Loader2 } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import { getPiecesBySection } from '@/lib/mindContent'
import { Card } from '@/components/ui'

interface DisciplineChallenge {
  _id: string
  challenge: string
  completed: boolean
  completedAt?: string
  excuse?: string
  excuseResponse?: string
}

type Mode = 'challenge' | 'excuse' | 'cold'

const DISCIPLINE_PROTOCOLS = getPiecesBySection('discipline')

function DisciplineModes() {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <Card>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Discipline Protocols
      </p>
      <p className="mb-4 text-sm text-zinc-500">When motivation fails, these don&apos;t.</p>
      <div className="-mx-3 sm:-mx-4 -mb-3 sm:-mb-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-t border-zinc-200 dark:border-zinc-800">
        {DISCIPLINE_PROTOCOLS.map((p) => (
          <div key={p.id}>
            <button
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-white">{p.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{p.source}</p>
              </div>
              <span className="text-zinc-400 text-lg ml-2 shrink-0">{expanded === p.id ? '−' : '+'}</span>
            </button>
            {expanded === p.id && (
              <div className="px-3 pb-3 pt-1">
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-2.5">
                  <p className="text-sm font-semibold italic text-zinc-800 dark:text-zinc-200 mb-2">
                    &ldquo;{p.mantra}&rdquo;
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p.instruction}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function DisciplineTab() {
  const [challenge, setChallenge] = useState<DisciplineChallenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>('challenge')
  const [excuseText, setExcuseText] = useState('')
  const [excuseResponse, setExcuseResponse] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Cold Mode timer
  const [coldActive, setColdActive] = useState(false)
  const [coldSeconds, setColdSeconds] = useState(90)
  const [coldRemaining, setColdRemaining] = useState(90)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }

    fetch('/api/mind/discipline', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.challenge) setChallenge(data.challenge) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!coldActive) return
    const interval = setInterval(() => {
      setColdRemaining((r) => {
        if (r <= 1) {
          setColdActive(false)
          return coldSeconds
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [coldActive, coldSeconds])

  async function markComplete() {
    setSubmitting(true)
    try {
      const token = getToken()
      const res = await fetch('/api/mind/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'complete' }),
      })
      if (res.ok) {
        const data = await res.json()
        setChallenge(data.challenge)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function submitExcuse() {
    if (excuseText.trim().length < 5) return
    setSubmitting(true)
    try {
      const token = getToken()
      const res = await fetch('/api/mind/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'excuse', excuse: excuseText }),
      })
      if (res.ok) {
        const data = await res.json()
        setChallenge(data.challenge)
        setExcuseResponse(data.excuseResponse)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function startCold() {
    setColdRemaining(coldSeconds)
    setColdActive(true)
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-5">
      {/* Daily challenge */}
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Daily Challenge
          </p>
          <span className="text-xs text-zinc-400">{todayStr}</span>
        </div>
        <p className="mb-1 text-xs text-zinc-400">Everyone gets this one today.</p>

        {challenge ? (
          <>
            <p className="my-4 text-base font-semibold leading-snug text-zinc-900 dark:text-white">
              {challenge.challenge}
            </p>

            {challenge.completed ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Done. You earned this one.
                </span>
              </div>
            ) : challenge.excuse ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-2.5">
                  <p className="text-xs text-zinc-500 mb-1">Your excuse</p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 italic">&ldquo;{challenge.excuse}&rdquo;</p>
                </div>
                {(excuseResponse || challenge.excuseResponse) && (
                  <div className="rounded-lg bg-zinc-900 p-3">
                    <p className="text-xs text-zinc-500 mb-2">Response</p>
                    <p className="text-sm font-semibold text-white">
                      {excuseResponse || challenge.excuseResponse}
                    </p>
                  </div>
                )}
                <button
                  onClick={markComplete}
                  disabled={submitting}
                  className="w-full rounded-lg bg-zinc-900 dark:bg-white py-3 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40"
                >
                  {submitting ? 'Saving...' : 'I did it anyway — mark complete'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {mode === 'challenge' && (
                  <div className="flex gap-2">
                    <button
                      onClick={markComplete}
                      disabled={submitting}
                      className="flex-1 rounded-lg bg-zinc-900 dark:bg-white py-3 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40"
                    >
                      {submitting ? 'Saving...' : 'Done — I completed this'}
                    </button>
                    <button
                      onClick={() => setMode('excuse')}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-xs font-semibold text-zinc-500 hover:border-zinc-400"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Excuse
                    </button>
                  </div>
                )}

                {mode === 'excuse' && (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-500">
                      Tell me why you couldn&apos;t do it. Be specific.
                    </p>
                    <textarea
                      value={excuseText}
                      onChange={(e) => setExcuseText(e.target.value)}
                      placeholder="I couldn't do it because..."
                      rows={3}
                      className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={submitExcuse}
                        disabled={submitting || excuseText.trim().length < 5}
                        className="flex-1 rounded-lg bg-zinc-900 dark:bg-white py-2.5 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40"
                      >
                        {submitting ? 'Submitting...' : 'Submit excuse'}
                      </button>
                      <button
                        onClick={() => setMode('challenge')}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-zinc-500"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">No challenge available for today.</p>
        )}
      </Card>

      {/* Discipline Modes */}
      <DisciplineModes />

      {/* Cold Mode */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-blue-400" />
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Cold Mode
          </p>
        </div>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-500">
          End your shower on cold. Use this timer. No getting out until it ends.
        </p>

        {/* Duration selector */}
        <div className="mb-4 flex gap-2">
          {[30, 60, 90, 120].map((s) => (
            <button
              key={s}
              onClick={() => { setColdSeconds(s); setColdRemaining(s); setColdActive(false) }}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                coldSeconds === s
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {s}s
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center">
          <div className="relative mb-4">
            <svg width="100" height="100" className="-rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-100 dark:text-zinc-800" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#60a5fa"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 * (1 - coldRemaining / coldSeconds)}
                style={{ transition: coldActive ? 'stroke-dashoffset 1s linear' : 'none' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold tabular-nums text-zinc-900 dark:text-white">
                {coldRemaining}s
              </span>
            </div>
          </div>

          {coldActive ? (
            <div className="text-center">
              <p className="mb-3 text-sm font-semibold text-blue-400">Stay in. Don&apos;t move.</p>
              <button
                onClick={() => { setColdActive(false); setColdRemaining(coldSeconds) }}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-xs text-zinc-500"
              >
                Reset
              </button>
            </div>
          ) : coldRemaining < coldSeconds ? (
            <div className="text-center">
              <p className="mb-3 text-sm font-semibold text-emerald-500">Done. That&apos;s discipline.</p>
              <button
                onClick={() => setColdRemaining(coldSeconds)}
                className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Reset
              </button>
            </div>
          ) : (
            <button
              onClick={startCold}
              className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white"
            >
              Start Cold Timer
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
