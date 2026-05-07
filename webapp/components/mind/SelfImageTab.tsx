'use client'

import { useState, useEffect } from 'react'
import { Flame, RefreshCw, CheckCircle2, Plus, ArrowRight } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import { getPiecesBySection } from '@/lib/mindContent'
import { Card } from '@/components/ui'

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

// ─── Evidence Builder ──────────────────────────────────────────────────────────

function EvidenceBuilder() {
  const [wins, setWins] = useState<{ win: string; date: string }[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch('/api/mind/wins', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.wins) setWins(d.wins) })
      .catch(() => {})
  }, [])

  async function logWin() {
    if (input.trim().length < 3) return
    setSaving(true)
    try {
      const token = getToken()
      const res = await fetch('/api/mind/wins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ win: input.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setWins((prev) => [data.win, ...prev].slice(0, 7))
        setInput('')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Evidence Builder
      </p>
      <p className="mb-4 text-sm text-zinc-500">
        Small wins compound into unshakeable confidence. Log one thing you did right today.
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && logWin()}
          placeholder="I did..."
          className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
        />
        <button
          onClick={logWin}
          disabled={saving || input.trim().length < 3}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 disabled:opacity-40 transition-opacity"
        >
          {saved ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      {wins.length > 0 && (
        <WinsList wins={wins} />
      )}
    </Card>
  )
}

function WinsList({ wins }: { wins: Array<{ win: string }> }) {
  const [shown, setShown] = useState(5)
  return (
    <div className="space-y-2">
      {wins.slice(0, shown).map((w, i) => (
        <div key={i} className="flex items-start gap-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{w.win}</p>
        </div>
      ))}
      {wins.length > 5 && (
        <button
          onClick={() => setShown(n => n > 5 ? 5 : n + 5)}
          className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {shown >= wins.length ? 'Show less' : `Show more (${wins.length - shown} remaining)`}
        </button>
      )}
    </div>
  )
}

// ─── Rewrite the Story ────────────────────────────────────────────────────────

function RewriteStory() {
  const [belief, setBelief] = useState('')
  const [step, setStep] = useState(0) // 0=input, 1=opposite, 2=evidence, 3=newStory, 4=done
  const [opposite, setOpposite] = useState('')
  const [evidence, setEvidence] = useState('')
  const [newStory, setNewStory] = useState('')

  function reset() {
    setBelief(''); setOpposite(''); setEvidence(''); setNewStory(''); setStep(0)
  }

  if (step === 4) {
    return (
      <Card>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Rewrite the Story</p>
        <div className="my-4 rounded-lg bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500 mb-1">Your new story</p>
          <p className="text-base font-bold text-white leading-snug">{newStory}</p>
        </div>
        <p className="mb-4 text-sm text-zinc-500">That&apos;s the story you operate from now. Read it when the old one comes back.</p>
        <button onClick={reset} className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Rewrite another
        </button>
      </Card>
    )
  }

  return (
    <Card>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Rewrite the Story</p>
      <p className="mb-4 text-sm text-zinc-500">The story you believe about yourself becomes true. Change the story, change the outcome.</p>

      {step === 0 && (
        <>
          <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">What limiting belief is running in the background?</p>
          <textarea
            value={belief}
            onChange={(e) => setBelief(e.target.value)}
            placeholder="e.g. I always quit when it gets hard"
            rows={2}
            className="mb-3 w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
          />
          <button onClick={() => setStep(1)} disabled={belief.trim().length < 5} className="flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40">
            Next <ArrowRight className="h-4 w-4" />
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <div className="mb-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5">
            <p className="text-xs text-zinc-500">Your belief</p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{belief}</p>
          </div>
          <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">What&apos;s the opposite of that belief?</p>
          <textarea
            value={opposite}
            onChange={(e) => setOpposite(e.target.value)}
            placeholder="e.g. I push through when it gets hard"
            rows={2}
            className="mb-3 w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
          />
          <button onClick={() => setStep(2)} disabled={opposite.trim().length < 5} className="flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40">
            Next <ArrowRight className="h-4 w-4" />
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">Where have you already proved the old belief wrong?</p>
          <p className="mb-3 text-xs text-zinc-500">One real example. Even small.</p>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="e.g. I finished that 6-week program even when I wanted to quit"
            rows={2}
            className="mb-3 w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
          />
          <button onClick={() => setStep(3)} disabled={evidence.trim().length < 5} className="flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40">
            Next <ArrowRight className="h-4 w-4" />
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">Write the new story. Present tense. Confident.</p>
          <textarea
            value={newStory}
            onChange={(e) => setNewStory(e.target.value)}
            placeholder="e.g. I am someone who finishes what I start, even when it's hard"
            rows={2}
            className="mb-3 w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
          />
          <button onClick={() => setStep(4)} disabled={newStory.trim().length < 5} className="flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40">
            Lock it in <CheckCircle2 className="h-4 w-4" />
          </button>
        </>
      )}
    </Card>
  )
}

// ─── Main tab ──────────────────────────────────────────────────────────────────

const IDENTITY_PROTOCOLS = getPiecesBySection('self-image')

interface Props {
  streak?: number
}

export default function SelfImageTab({ streak = 0 }: Props) {
  const [statementIdx, setStatementIdx] = useState(0)
  const [affirming, setAffirming] = useState(false)
  const [affirmed, setAffirmed] = useState(false)
  const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null)

  useEffect(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    )
    setStatementIdx(dayOfYear % IDENTITY_POOL.length)
  }, [])

  function nextStatement() { setStatementIdx((i) => (i + 1) % IDENTITY_POOL.length); setAffirmed(false) }

  function handleAffirm() {
    setAffirming(true)
    setTimeout(() => { setAffirming(false); setAffirmed(true) }, 600)
  }

  const streakLabel = streak >= 30 ? 'Elite' : streak >= 14 ? 'Consistent' : streak >= 7 ? 'Building' : streak >= 3 ? 'Starting' : 'Day 1'
  const streakColor = streak >= 30 ? 'text-yellow-400' : streak >= 14 ? 'text-orange-400' : streak >= 7 ? 'text-emerald-400' : 'text-zinc-400'

  return (
    <div className="space-y-5">
      {/* Daily identity statement */}
      <Card>
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
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-semibold">Affirmed.</span>
          </div>
        ) : (
          <button
            onClick={handleAffirm}
            disabled={affirming}
            className="rounded-lg bg-zinc-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 transition-opacity disabled:opacity-60"
          >
            {affirming ? 'Affirming...' : 'This is me — I affirm this'}
          </button>
        )}
      </Card>

      {/* Streak tier */}
      <Card>
        <div className="flex items-center gap-3">
          <Flame className={`h-6 w-6 ${streakColor}`} />
          <div>
            <p className={`text-lg font-bold ${streakColor}`}>{streakLabel}</p>
            <p className="text-xs text-zinc-500">{streak} day streak — your identity is being built in real time</p>
          </div>
        </div>
      </Card>

      {/* Identity protocols from content library */}
      <Card>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Identity Protocols
        </p>
        <p className="mb-4 text-sm text-zinc-500">Expand any protocol. Read the mantra. Do the instruction.</p>
        <div className="-mx-3 sm:-mx-4 -mb-3 sm:-mb-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-t border-zinc-200 dark:border-zinc-800">
          {IDENTITY_PROTOCOLS.map((p) => (
            <div key={p.id}>
              <button
                onClick={() => setExpandedProtocol(expandedProtocol === p.id ? null : p.id)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{p.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{p.source}</p>
                </div>
                <span className="text-zinc-400 text-lg ml-2 shrink-0">{expandedProtocol === p.id ? '−' : '+'}</span>
              </button>
              {expandedProtocol === p.id && (
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

      {/* Rewrite the Story */}
      <RewriteStory />

      {/* Evidence Builder */}
      <EvidenceBuilder />
    </div>
  )
}
