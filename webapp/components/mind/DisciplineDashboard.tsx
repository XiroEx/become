'use client'

// Discipline system dashboard. Shares the SystemDashboard primitives but its
// PRIMARY mechanic is distinct from the other systems: a persistent
// Non-Negotiables tracker — standing user-defined standards with daily check-off
// and a breakable per-item streak (the thing that pulls you back daily). Plus
// today's rotating hard-thing and guided protocols. Habit/goal tracking is a
// separate dedicated home (not here).

import { useCallback, useEffect, useState } from 'react'
import { Sword, Flame, Soup, Gauge, Eye, Megaphone, ShieldCheck, Check, Trash2, Crosshair } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { SystemHero, ToolkitCard, TrackRecord, DailyDrop, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { dailyPick } from '@/lib/mind/rotation'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#ef4444' // red — discipline system color
const DONE_TEXT = 'That’s how it’s built.' // discipline-specific finish line

const PROTOCOLS: { id: string; title: string; blurb: string; Icon: typeof Flame; steps: GuidedStep[] }[] = [
  {
    id: 'do-it-anyway', title: 'Do It Anyway', blurb: 'Feelings are data, not instructions.', Icon: Flame,
    steps: [
      {
        title: 'What’s the resistance?',
        body: 'Name what’s really in the way right now.',
        choices: ['Tired', 'Bored', 'Scared', 'Too busy', 'Just don’t want to'],
      },
      {
        title: 'What are you dodging?',
        inputPrompt: 'What are you dodging?',
        body: 'The exact thing you keep pushing off — the workout, the call, the task. Be specific.',
        placeholder: 'e.g. The leg workout I keep skipping',
      },
      { title: 'Go execute it.', body: 'Every time you do what you said regardless of how you feel, you become someone who does what they say.' },
    ],
  },
  {
    id: 'eat-the-frog', title: 'Eat the Frog', blurb: 'Hardest thing first. The day is won.', Icon: Soup,
    steps: [
      {
        title: 'What’s your frog today?',
        inputPrompt: 'What’s your frog today?',
        body: 'Your “frog” is the hardest, ugliest, most-avoided task on your plate right now.',
        placeholder: 'e.g. Finish the proposal I’ve been avoiding',
      },
      { title: 'Eat it first.', body: 'No phone, no food, no “quick” anything until that one’s started. The momentum carries the whole day.' },
    ],
  },
  {
    id: 'find-your-40', title: 'Find Your 40%', blurb: 'When you think you’re done, you’re at 40%.', Icon: Gauge,
    steps: [
      { title: 'Your tank has more.', body: 'That “done” feeling is your comfort system talking, not your real limit. It’s lying to you.' },
      {
        title: 'What’s your one-more?',
        inputPrompt: 'What’s your one-more?',
        body: 'One more rep, one more minute, one more step past where you wanted to quit. Name it.',
        placeholder: 'e.g. 5 more minutes on the run',
      },
      { title: 'Go get it.', body: 'Just that next checkpoint. Once you’re there, you’ll find another.' },
    ],
  },
  {
    id: 'cold-reality', title: 'Cold Reality', blurb: 'Where you are is the result of what you’ve done.', Icon: Eye,
    steps: [
      { title: 'Sixty brutally honest seconds.', body: 'No blame. No excuses. Just the facts about where you actually are right now.' },
      {
        title: 'What got you here?',
        inputPrompt: 'What got you here?',
        body: 'The habits and choices — good and bad — that built your current situation. Own all of it.',
        placeholder: 'e.g. Late nights, skipped mornings, no real plan',
      },
      { title: 'Now decide.', body: 'What changes if you keep those habits? What changes if you don’t? You already know.' },
    ],
  },
  {
    id: 'excuse-callout', title: 'Excuse Callout', blurb: 'An excuse is a lie told too many times.', Icon: Megaphone,
    steps: [
      {
        title: 'What’s your excuse?',
        inputPrompt: 'What’s your excuse?',
        body: 'Say the exact thing you’re about to tell yourself to get out of it.',
        placeholder: 'e.g. I’m too tired to train today',
      },
      { title: 'Is it true — or is it comfort?', body: 'Discomfort is not danger. That excuse has a solution, and somewhere you already know what it is.' },
      { title: 'Do it anyway.', body: 'You’ll respect yourself more at the end of the day. Your future self is watching this exact decision.' },
    ],
  },
]

const SET_NONNEGOTIABLE: GuidedStep[] = [
  { title: 'Draw a line you won’t cross.', body: 'A non-negotiable is the floor you defend no matter what — not the goal, the standard beneath it.' },
  {
    title: 'What’s your line?',
    inputPrompt: 'What’s your line?',
    body: 'One standard you refuse to drop below, in your own words.',
    placeholder: 'e.g. I train even on bad days',
  },
  { title: 'That’s your standard now.', body: 'Standards you defend become identity. Defend this one today.' },
]

const FIGHT_LABELS: Record<number, string> = { 1: 'Coasting', 2: 'Light', 3: 'Solid', 4: 'Hard', 5: 'All in' }

// A quick daily scale check — a different interaction shape from the typed flows.
const FIGHT_CHECK: GuidedStep[] = [
  {
    title: 'How hard are you willing to go today?',
    body: 'No wrong answer — just be honest about today’s fight.',
    scale: { min: 1, max: 5, minLabel: 'Coasting', maxLabel: 'All in' },
  },
  { title: 'Now back it up.', body: 'A number is a promise to yourself. Make today match it.' },
]

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

interface TodayChallenge { challenge: string; completed: boolean }
interface NonNeg { id: string; text: string; currentStreak: number; longestStreak: number; checkedToday: boolean }

export default function DisciplineDashboard() {
  const { toast, showToast } = useToast()
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  const [today, setToday] = useState<TodayChallenge | null>(null)
  const [nonNegs, setNonNegs] = useState<NonNeg[]>([])
  const [fightToday, setFightToday] = useState<number | null>(null) // today's fight-check score
  const [marking, setMarking] = useState(false)
  const [flow, setFlow] = useState<{ title: string; kind: string; steps: GuidedStep[] } | null>(null)

  const load = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset()
      const [jr, cr, nr] = await Promise.all([
        fetch('/api/mind/journal?system=discipline&limit=8', { headers: authHeaders() }),
        fetch(`/api/mind/discipline?tz=${tz}`, { headers: authHeaders() }),
        fetch(`/api/mind/non-negotiables?tz=${tz}`, { headers: authHeaders() }),
      ])
      if (jr.ok) {
        const d = await jr.json()
        const raw: Array<{ _id: string; title: string; kind: string; createdAt: string; lines?: { answer?: string }[] }> = d.entries ?? []
        setEntries(raw.map((e) => ({ id: String(e._id), title: e.title, kind: e.kind, createdAt: e.createdAt })))
        // Surface today's fight-check score (it was saving silently before).
        const todayStr = new Date().toDateString()
        const fc = raw.find((e) => e.kind === 'fight-check' && new Date(e.createdAt).toDateString() === todayStr)
        const v = fc?.lines?.[0]?.answer ? Number(fc.lines[0].answer) : NaN
        setFightToday(Number.isFinite(v) ? v : null)
      }
      if (cr.ok) {
        const d = await cr.json()
        if (d.challenge) setToday({ challenge: d.challenge.challenge, completed: !!d.challenge.completed })
      }
      if (nr.ok) {
        const d = await nr.json()
        setNonNegs(d.items ?? [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Non-negotiables (the distinct centerpiece of Discipline) ──
  const heldToday = nonNegs.filter((n) => n.checkedToday).length
  const topStreak = nonNegs.reduce((m, n) => Math.max(m, n.currentStreak), 0)

  const createNonNeg = async (text: string) => {
    try {
      const res = await fetch('/api/mind/non-negotiables', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        showToast(e.error || 'Could not save', 'error')
        return
      }
      showToast('That’s your line now. Defend it. 🗡️', 'success')
      load()
    } catch { showToast('Could not save', 'error') }
  }

  const checkNonNeg = async (n: NonNeg) => {
    if (n.checkedToday) return
    const tz = new Date().getTimezoneOffset()
    setNonNegs((prev) => prev.map((x) => x.id === n.id ? { ...x, checkedToday: true, currentStreak: x.currentStreak + 1 } : x)) // optimistic
    try {
      await fetch('/api/mind/non-negotiables', {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ id: n.id, action: 'check', tz }),
      })
      load()
    } catch { /* ignore */ }
  }

  const removeNonNeg = async (id: string) => {
    setNonNegs((prev) => prev.filter((x) => x.id !== id)) // optimistic
    try {
      await fetch('/api/mind/non-negotiables', {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ id, action: 'deactivate' }),
      })
    } catch { /* ignore */ }
  }

  const save = async (kind: string, title: string, lines: { prompt: string; answer: string }[]) => {
    try {
      await fetch('/api/mind/journal', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ system: 'discipline', kind, title, lines }),
      })
      load()
    } catch { /* ignore */ }
  }

  const markDone = async () => {
    if (marking || !today || today.completed) return
    setMarking(true)
    setToday({ ...today, completed: true }) // optimistic
    showToast('That’s how it’s built. 🗡️', 'success')
    try {
      const tz = new Date().getTimezoneOffset()
      await fetch('/api/mind/discipline', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ action: 'complete', tz }),
      })
      await save('did-the-hard-thing', today.challenge, [])
    } catch { /* ignore */ }
    setMarking(false)
  }

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENT}
        doneText={DONE_TEXT}
        onExit={() => setFlow(null)}
        onComplete={(answers) => {
          const kind = flow.kind
          setFlow(null)
          if (kind === 'nonnegotiable') {
            // Create a STANDING non-negotiable from the typed line (don't journal).
            const line = answers[0]?.answer?.trim()
            if (line) createNonNeg(line)
            return
          }
          if (kind === 'fight-check') {
            const v = Number(answers[0]?.answer)
            if (Number.isFinite(v)) setFightToday(v) // optimistic — card flips to done state
            showToast('Fight set. Now make today match it. 🗡️', 'success')
            save(kind, flow.title, answers)
            return
          }
          showToast('Logged to your track record', 'success')
          save(kind, flow.title, answers)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <SystemHero
        Icon={Sword}
        title="Discipline"
        tagline="Hold your own line — do the hard thing"
        statValue={topStreak > 0 ? `${topStreak}🔥` : '—'}
        statLabel="best streak"
        color="text-red-500"
        bg="bg-red-50 dark:bg-red-500/10"
      />

      {/* Your non-negotiables — the standing, checkable, streak-tracked list.
          This is what makes Discipline distinct from the other systems. */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Your non-negotiables</p>
          {nonNegs.length > 0 && (
            <span className="text-[11px] font-semibold text-zinc-400">{heldToday}/{nonNegs.length} held today</span>
          )}
        </div>

        <div className="space-y-2">
          {nonNegs.map((n) => (
            <div
              key={n.id}
              className={`group flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${
                n.checkedToday
                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                  : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
              }`}
            >
              <button
                onClick={() => checkNonNeg(n)}
                aria-label={n.checkedToday ? 'Held today' : 'Mark held today'}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  n.checkedToday
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-zinc-300 text-transparent hover:border-red-400 dark:border-zinc-600'
                }`}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </button>
              <p className={`min-w-0 flex-1 text-sm font-medium ${n.checkedToday ? 'text-zinc-500 line-through dark:text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                {n.text}
              </p>
              {n.currentStreak > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                  <Flame className="h-3.5 w-3.5" />{n.currentStreak}
                </span>
              )}
              <button
                onClick={() => removeNonNeg(n.id)}
                aria-label="Remove"
                className="shrink-0 p-1 text-zinc-300 transition-colors hover:text-red-500 dark:text-zinc-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {nonNegs.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-700">
            No lines drawn yet. Set the standards you refuse to drop below — then check them off daily and build a streak.
          </p>
        )}

        {nonNegs.length < 7 && (
          <button
            type="button"
            onClick={() => setFlow({ title: 'Set a non-negotiable', kind: 'nonnegotiable', steps: SET_NONNEGOTIABLE })}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-red-300 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
          >
            <ShieldCheck className="h-4 w-4" />
            Draw a new line
          </button>
        )}
      </div>

      {/* Daily fight check — once done today, show the logged score + a done
          state (tap to redo) instead of the generic prompt. */}
      {fightToday != null ? (
        <button
          type="button"
          onClick={() => setFlow({ title: 'Fight check', kind: 'fight-check', steps: FIGHT_CHECK })}
          className="flex w-full items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-left transition-transform active:scale-[0.99] dark:border-emerald-500/30 dark:bg-emerald-500/10"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Crosshair className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Daily fight check · logged</p>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              Today: {fightToday}/5 — {FIGHT_LABELS[fightToday] ?? ''}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Tap to change your answer.</p>
          </div>
          <Check className="h-5 w-5 shrink-0 text-emerald-500" strokeWidth={3} />
        </button>
      ) : (
        <DailyDrop
          Icon={Crosshair}
          eyebrow="Daily fight check"
          title="How hard will you go today?"
          blurb="One tap. Sets the bar for the day."
          ctaLabel="Check"
          color="text-red-500"
          onClick={() => setFlow({ title: 'Fight check', kind: 'fight-check', steps: FIGHT_CHECK })}
        />
      )}

      {/* Today's hard thing — the rotating daily challenge (distinct from the
          standing "Your non-negotiables" list below; avoid the name collision). */}
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Today’s hard thing</p>
        <p className="mt-2 text-base font-bold leading-snug text-zinc-900 dark:text-white">
          {today?.challenge ?? 'Loading your hard thing…'}
        </p>
        {today?.completed ? (
          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-5 w-5" strokeWidth={3} /> Done today. Respect.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={markDone}
              disabled={marking || !today}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <Check className="h-4 w-4" strokeWidth={3} /> I did it
            </button>
            <button
              onClick={() => setFlow({ title: 'Do It Anyway', kind: 'protocol', steps: PROTOCOLS[0].steps })}
              className="text-xs font-medium text-red-600/80 transition-colors hover:text-red-700 dark:text-red-300/80"
            >
              Not feeling it? →
            </button>
          </div>
        )}
      </div>

      {/* Protocols — guided runs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Discipline protocols</p>
        <div className="space-y-2">
          {PROTOCOLS.map((p) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              color="text-red-500"
              onClick={() => setFlow({ title: p.title, kind: 'protocol', steps: p.steps })}
            />
          ))}
        </div>
      </div>

      {/* Track record */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Track record</p>
        <TrackRecord entries={entries} />
      </div>

      <Toast toast={toast} />
    </div>
  )
}
