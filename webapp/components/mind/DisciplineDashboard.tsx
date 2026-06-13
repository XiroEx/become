'use client'

// Discipline system dashboard — built on the shared SystemDashboard skeleton,
// same interactive treatment as Anti-Sabotage. Reframed per product direction:
// Discipline is about NON-NEGOTIABLES (doing the hard thing, holding your own
// line), NOT habit/goal tracking (that gets its own dedicated home). No dead
// text — today's hard thing is one-tap done, protocols run as GuidedFlows,
// setting a non-negotiable is a journaled flow, everything lands in the record.

import { useCallback, useEffect, useState } from 'react'
import { Sword, Flame, Soup, Gauge, Eye, Megaphone, ShieldCheck, Check } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { SystemHero, ToolkitCard, TrackRecord, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#ef4444' // red — discipline system color
const DONE_TEXT = 'That’s how it’s built.' // discipline-specific finish line

const PROTOCOLS: { id: string; title: string; blurb: string; Icon: typeof Flame; steps: GuidedStep[] }[] = [
  {
    id: 'do-it-anyway', title: 'Do It Anyway', blurb: 'Feelings are data, not instructions.', Icon: Flame,
    steps: [
      { title: 'You don’t feel like it.', body: 'Noted. The plan doesn’t care how you feel — and neither does the person you’re becoming.' },
      {
        title: 'What are you dodging?',
        inputPrompt: 'What are you dodging?',
        body: 'Name the exact thing you keep pushing off — the workout, the call, the task. Be specific.',
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

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

interface TodayChallenge { challenge: string; completed: boolean }

export default function DisciplineDashboard() {
  const { toast, showToast } = useToast()
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  const [reps, setReps] = useState(0)
  const [today, setToday] = useState<TodayChallenge | null>(null)
  const [marking, setMarking] = useState(false)
  const [flow, setFlow] = useState<{ title: string; kind: string; steps: GuidedStep[] } | null>(null)

  const load = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset()
      const [jr, cr] = await Promise.all([
        fetch('/api/mind/journal?system=discipline&limit=8', { headers: authHeaders() }),
        fetch(`/api/mind/discipline?tz=${tz}`, { headers: authHeaders() }),
      ])
      if (jr.ok) {
        const d = await jr.json()
        setEntries((d.entries ?? []).map((e: { _id: string; title: string; kind: string; createdAt: string }) => ({
          id: String(e._id), title: e.title, kind: e.kind, createdAt: e.createdAt,
        })))
        const counts = d.counts ?? {}
        setReps(Object.values(counts).reduce((a: number, b) => a + (b as number), 0))
      }
      if (cr.ok) {
        const d = await cr.json()
        if (d.challenge) setToday({ challenge: d.challenge.challenge, completed: !!d.challenge.completed })
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

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
          setFlow(null)
          showToast('Logged to your track record', 'success')
          save(flow.kind, flow.title, answers)
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
        statValue={reps}
        statLabel="reps logged"
        color="text-red-500"
        bg="bg-red-50 dark:bg-red-500/10"
      />

      {/* Today's non-negotiable — the do-one-now */}
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Today’s non-negotiable</p>
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

      {/* Set a non-negotiable */}
      <ToolkitCard
        Icon={ShieldCheck}
        title="Set a non-negotiable"
        blurb="Name a standard you’ll defend. It gets saved."
        color="text-red-500"
        onClick={() => setFlow({ title: 'Set a non-negotiable', kind: 'nonnegotiable', steps: SET_NONNEGOTIABLE })}
      />

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
