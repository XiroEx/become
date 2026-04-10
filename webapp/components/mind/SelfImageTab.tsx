'use client'

import { useState, useEffect } from 'react'
import { Flame, RefreshCw } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

// ─── Identity statement pools ──────────────────────────────────────────────────

const IDENTITY_POOL = [
  'I am someone who does the work even when I don\'t feel like it.',
  'I am disciplined, focused, and consistent.',
  'I am becoming stronger every single day.',
  'I am the type of person who shows up.',
  'I am in control of my choices and my outcomes.',
  'I am a high performer who protects my standards.',
  'I am building a body and mind I\'m proud of.',
  'I am mentally tough.',
  'I am exactly where I need to be to become what I want.',
  'I am someone who finishes what they start.',
  'I am not driven by comfort — I\'m driven by purpose.',
  'I am the hardest worker in any room I enter.',
  'I am capable of far more than I currently believe.',
  'I am growing through every challenge placed in front of me.',
  'I am not defined by how I feel — I\'m defined by what I do.',
]

const VISUALIZATION_SCRIPTS = [
  {
    title: 'The Ideal Day',
    duration: '3 min',
    script: `Close your eyes. Take three deep breaths.\n\nPicture yourself waking up tomorrow — already the version of yourself you're working toward. You don't hesitate when the alarm goes off. You move with purpose.\n\nYou train the way that person trains. You eat the way they eat. You carry yourself the way they carry themselves.\n\nNow fast-forward to the end of the day. You look back at everything you did. You made the right choices. You didn't waste time. You showed up for yourself.\n\nThat person is not far away. You are already becoming them.`,
  },
  {
    title: 'Championship Self',
    duration: '3 min',
    script: `Picture a version of you — one year from now — who executed everything they set out to do this year.\n\nWhat do they look like? How do they move? How do people respond to them?\n\nThey didn't get there by accident. They got there because of what you're choosing right now.\n\nEvery hard session. Every meal they didn't skip. Every night they slept when they wanted to stay up. Every moment they pushed when they wanted to quit.\n\nYou're building that person right now. This moment counts.`,
  },
  {
    title: 'Own the Room',
    duration: '2 min',
    script: `You walk into every room with quiet confidence. Not arrogance — just certainty.\n\nYou've put in the work others won't. You know your mission. You hold your standard even when no one is watching.\n\nPicture yourself walking in — a gym, a meeting, a social setting. You feel the ground under your feet. Your posture is tall. Your presence is calm.\n\nYou don't need their approval. You already know who you are.`,
  },
]

interface Props {
  streak?: number
}

export default function SelfImageTab({ streak = 0 }: Props) {
  const [statementIdx, setStatementIdx] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [affirming, setAffirming] = useState(false)
  const [affirmed, setAffirmed] = useState(false)

  useEffect(() => {
    // Pick a daily statement based on day of year
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    )
    setStatementIdx(dayOfYear % IDENTITY_POOL.length)
  }, [])

  function nextStatement() {
    setStatementIdx((i) => (i + 1) % IDENTITY_POOL.length)
    setAffirmed(false)
  }

  function handleAffirm() {
    setAffirming(true)
    setTimeout(() => {
      setAffirming(false)
      setAffirmed(true)
    }, 600)
  }

  // Streak tier label
  const streakLabel =
    streak >= 30 ? 'Elite' :
    streak >= 14 ? 'Consistent' :
    streak >= 7 ? 'Building' :
    streak >= 3 ? 'Starting' :
    'Day 1'

  const streakColor =
    streak >= 30 ? 'text-yellow-400' :
    streak >= 14 ? 'text-orange-400' :
    streak >= 7 ? 'text-emerald-400' :
    'text-zinc-400'

  return (
    <div className="space-y-5">
      {/* Identity statement */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Today&apos;s Identity Statement
          </p>
          <button onClick={nextStatement} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <blockquote className="mb-5 text-lg font-semibold leading-snug text-zinc-900 dark:text-white">
          &ldquo;{IDENTITY_POOL[statementIdx]}&rdquo;
        </blockquote>
        {affirmed ? (
          <div className="flex items-center gap-2 text-emerald-500">
            <span className="text-sm font-semibold">Affirmed.</span>
          </div>
        ) : (
          <button
            onClick={handleAffirm}
            disabled={affirming}
            className="rounded-xl bg-zinc-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 transition-opacity disabled:opacity-60"
          >
            {affirming ? 'Affirming...' : 'This is me — I affirm this'}
          </button>
        )}
      </div>

      {/* Streak tier */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex items-center gap-3">
          <Flame className={`h-6 w-6 ${streakColor}`} />
          <div>
            <p className={`text-lg font-bold ${streakColor}`}>{streakLabel}</p>
            <p className="text-xs text-zinc-500">{streak} day streak — your identity is being built in real time</p>
          </div>
        </div>
      </div>

      {/* Visualization scripts */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Visualization
        </p>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-500">
          Read slowly. Really see it.
        </p>
        <div className="space-y-3">
          {VISUALIZATION_SCRIPTS.map((v, i) => (
            <div key={v.title} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{v.title}</p>
                  <p className="text-xs text-zinc-500">{v.duration} read</p>
                </div>
                <span className="text-zinc-400 text-lg">{expanded === i ? '−' : '+'}</span>
              </button>
              {expanded === i && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 pb-5 pt-4">
                  {v.script.split('\n\n').map((para, j) => (
                    <p key={j} className="mb-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 last:mb-0">
                      {para}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
