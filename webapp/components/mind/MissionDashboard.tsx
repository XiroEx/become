'use client'

// Mission system dashboard — one of the two "fuel" segments of the Mind arsenal.
// Mission is PURPOSE + DIRECTION + MOVEMENT: your why, where you're headed, and
// the daily forward move that keeps you in motion ("without movement there is no
// energy"). Its answers — the mission statement — feed the AI grounding, so every
// other Mind segment reasons from the user's actual purpose.
//
// Built on the shared SystemDashboard skeleton. Signature mechanic: your standing
// Mission (purpose/why/forward move) + a daily "I moved forward" that builds a
// momentum streak (the daily-return hook). Protocols run as GuidedFlows with the
// adaptive close; the headline is the memory-aware adaptive session.

import { useCallback, useEffect, useState } from 'react'
import { Compass, Search, Zap, UserRound, Navigation, Flame, Check, ArrowRight } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { runAiTask } from '@/lib/ai/runClient'
import { validateGuidedSteps } from '@/lib/ai/sanitize'
import { SystemHero, ToolkitCard, TrackRecord, AdaptiveSession, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { reflectOnAnswers } from '@/lib/mind/reflect'
import { dailyPick } from '@/lib/mind/rotation'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#3b82f6' // blue — mission / direction system color
const DONE_TEXT = 'That’s the direction.' // mission-specific finish line

// ── Mission protocols as guided runs (Become-voiced, never naming a source) ──

const PROTOCOLS: { id: string; title: string; blurb: string; Icon: typeof Compass; steps: GuidedStep[] }[] = [
  {
    id: 'find-your-why', title: 'Find Your Why', blurb: 'Dig past the surface reason to the real one.', Icon: Search,
    steps: [
      {
        title: 'Why are you really doing this?',
        inputPrompt: 'Why are you really doing this?',
        body: 'The first answer that comes up — the surface reason.',
        placeholder: 'e.g. To get in shape',
      },
      {
        title: 'And why does that matter?',
        inputPrompt: 'And why does that matter?',
        body: 'Go one layer under the last answer. Keep pulling the thread.',
        placeholder: 'e.g. So I feel in control of my life again',
      },
      {
        title: 'Now the real one — what’s underneath?',
        inputPrompt: 'Now the real one — what’s underneath?',
        body: 'The reason that actually moves you. Say it plainly.',
        placeholder: 'e.g. I want to become someone my future family can rely on',
      },
      { title: 'That’s your fuel.', body: 'That’s the reason worth moving for. Come back to it when the surface reason isn’t enough.' },
    ],
  },
  {
    id: 'one-move', title: 'One Move Forward', blurb: 'Movement makes energy. Energy makes life.', Icon: Zap,
    steps: [
      { title: 'Without movement there’s no energy.', body: 'Stillness drains. One real move starts the current again. Let’s find it.' },
      {
        title: 'Where have you gone still?',
        inputPrompt: 'Where have you gone still?',
        body: 'The part of your life that’s stalled or stuck right now.',
        placeholder: 'e.g. I keep planning but never start',
      },
      {
        title: 'The one move that creates motion.',
        inputPrompt: 'The one move that creates motion.',
        body: 'Small is fine — it just has to be motion, today.',
        placeholder: 'e.g. Send the one message I’ve been avoiding',
      },
      { title: 'Go make it.', body: 'Motion makes energy; energy makes life. Take that one step now and the next one appears.' },
    ],
  },
  {
    id: 'who-you-want', title: 'Who You Want to Be', blurb: 'You can become anyone. Choose on purpose.', Icon: UserRound,
    steps: [
      {
        title: 'Who do you want to become?',
        inputPrompt: 'Who do you want to become?',
        body: 'Not what you want to have — who you want to be. In your own words.',
        placeholder: 'e.g. Someone disciplined, present, and dependable',
      },
      {
        title: 'Is today’s version acting like them?',
        body: 'Honestly. No judgment — just data.',
        choices: ['Yes, mostly', 'Not really', 'Halfway there'],
      },
      { title: 'Every choice is a vote.', body: 'You become who you repeatedly act like. Cast one vote for that person in the next hour.' },
    ],
  },
  {
    id: 'north-star', title: 'North Star Check', blurb: 'Did today actually point where you’re going?', Icon: Navigation,
    steps: [
      {
        title: 'What did today actually go toward?',
        inputPrompt: 'What did today actually go toward?',
        body: 'Where your hours really went — not where you meant them to go.',
        placeholder: 'e.g. Mostly reacting to messages and scrolling',
      },
      {
        title: 'Did it move you toward your mission?',
        body: 'The honest read on alignment.',
        choices: ['Yes', 'Some of it', 'Not really'],
      },
      { title: 'Aim one hour tomorrow.', body: 'You don’t need a perfect day — one hour pointed straight at the mission bends the whole week.' },
    ],
  },
  {
    id: 'reconnect', title: 'Reconnect to Purpose', blurb: 'When you drift, come back to the why.', Icon: Flame,
    steps: [
      { title: 'Read your why. Out loud if you can.', body: 'Drifting means you lost contact with the reason. Let’s restore it.' },
      {
        title: 'Say why it matters — right now.',
        inputPrompt: 'Say why it matters — right now.',
        body: 'In your own words, today. Not the old script — how it feels now.',
        placeholder: 'e.g. Because I’m done being the person who starts and quits',
      },
      { title: 'Now move while it’s lit.', body: 'That’s the fuel. Take one step toward it before the feeling fades — motion keeps the flame going.' },
    ],
  },
]

// ── Define-your-mission flow (writes the Mission via PUT) ──────────────────────
const DEFINE_MISSION: GuidedStep[] = [
  {
    title: 'What do you want to do with your life?',
    inputPrompt: 'What do you want to do with your life?',
    body: 'Your purpose — the direction you want everything to move toward. It can grow later; just name it honestly now.',
    placeholder: 'e.g. Build a strong body and mind so I can lead and provide',
  },
  {
    title: 'Why does it matter to you?',
    inputPrompt: 'Why does it matter to you?',
    body: 'The real reason underneath. This is the fuel that keeps you moving on hard days.',
    placeholder: 'e.g. I’m done drifting — I want to be someone I respect',
  },
  {
    title: 'The one thing you’ll do daily to move toward it.',
    inputPrompt: 'The one thing you’ll do daily to move toward it.',
    body: 'Small and repeatable. Movement is the whole point.',
    placeholder: 'e.g. Train and plan tomorrow before bed',
  },
  { title: 'That’s your direction now.', body: 'Everything in here moves toward it. Come back daily and take your one step forward.' },
]

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

interface MissionData { purpose: string; whyItMatters: string; dailyAction: string }
interface MomentumData { streak: number; longest: number; movedToday: boolean }

export default function MissionDashboard() {
  const { toast, showToast } = useToast()
  const [mission, setMission] = useState<MissionData | null>(null)
  const [momentum, setMomentum] = useState<MomentumData>({ streak: 0, longest: 0, movedToday: false })
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  const [moving, setMoving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [flow, setFlow] = useState<{ title: string; kind: string; steps: GuidedStep[]; aiGenerated?: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset()
      const [mr, jr] = await Promise.all([
        fetch(`/api/mind/mission?tz=${tz}`, { headers: authHeaders() }),
        fetch('/api/mind/journal?system=mission&limit=8', { headers: authHeaders() }),
      ])
      if (mr.ok) {
        const d = await mr.json()
        setMission(d.mission ? { purpose: d.mission.purpose, whyItMatters: d.mission.whyItMatters, dailyAction: d.mission.dailyAction } : null)
        if (d.momentum) setMomentum(d.momentum)
      }
      if (jr.ok) {
        const raw: Array<{ _id: string; title: string; kind: string; createdAt: string }> = (await jr.json()).entries ?? []
        setEntries(raw.map((e) => ({ id: String(e._id), title: e.title, kind: e.kind, createdAt: e.createdAt })))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (kind: string, title: string, lines: { prompt: string; answer: string }[]) => {
    try {
      await fetch('/api/mind/journal', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ system: 'mission', kind, title, lines }),
      })
      load()
    } catch { /* ignore */ }
  }

  // The daily forward move — movement is the point. Optimistic; streak advances
  // server-side, idempotent per day.
  const moveForward = async () => {
    if (moving || momentum.movedToday) return
    setMoving(true)
    setMomentum((m) => ({ ...m, movedToday: true, streak: m.streak + 1 })) // optimistic
    showToast('That’s momentum. Movement is energy. 🧭', 'success')
    try {
      const tz = new Date().getTimezoneOffset()
      const r = await fetch('/api/mind/mission', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ action: 'move', tz }) })
      if (r.ok) { const d = await r.json(); if (d.momentum) setMomentum(d.momentum) }
    } catch { /* ignore */ }
    setMoving(false)
  }

  const saveMission = async (answers: { prompt: string; answer: string }[]) => {
    const purpose = (answers[0]?.answer ?? '').trim()
    const whyItMatters = (answers[1]?.answer ?? '').trim()
    const dailyAction = (answers[2]?.answer ?? '').trim()
    if (!purpose || !whyItMatters || !dailyAction) { showToast('Something was missing — try again', 'error'); return }
    try {
      const res = await fetch('/api/mind/mission', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ purpose, whyItMatters, dailyAction }),
      })
      if (res.ok) { showToast('That’s your direction. Now move toward it daily. 🧭', 'success'); load() }
      else showToast('Could not save', 'error')
    } catch { showToast('Could not save', 'error') }
  }

  const runAiFlow = async (topic: string, fallback: typeof PROTOCOLS[0]) => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const r = await runAiTask('/api/ai/mind/flow', { system: 'mission', topic })
      const steps = validateGuidedSteps((r.result as { steps?: unknown } | undefined)?.steps)
      if (r.ok && steps) { setFlow({ title: topic, kind: 'protocol', steps, aiGenerated: true }); return }
    } catch { /* fall through */ }
    showToast("Using today's protocol", 'neutral')
    setFlow({ title: fallback.title, kind: 'protocol', steps: fallback.steps })
  }

  const featured = dailyPick(PROTOCOLS, 4)

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENT}
        doneText={flow.kind === 'define' ? 'Your direction is set.' : DONE_TEXT}
        onReflect={(flow.aiGenerated || flow.kind === 'define') ? undefined : (a) => reflectOnAnswers('Mission session', a)}
        onExit={() => { setFlow(null); setAiLoading(false) }}
        onComplete={(answers) => {
          const kind = flow.kind
          setFlow(null); setAiLoading(false)
          if (kind === 'define') { saveMission(answers); return }
          showToast('Logged to your track record', 'success')
          save(kind, flow.title, answers)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <SystemHero
        Icon={Compass}
        title="Mission"
        tagline="Your purpose — the direction everything moves toward"
        statValue={mission ? (momentum.streak > 0 ? `${momentum.streak}🔥` : '0') : '—'}
        statLabel="on mission"
        color="text-blue-500"
        bg="bg-blue-50 dark:bg-blue-500/10"
      />

      {/* ── Your Mission — the fuel + the daily forward move ── */}
      {mission ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">Your mission</p>
          <p className="mt-2 text-base font-bold leading-snug text-zinc-900 dark:text-white">{mission.purpose}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Why: {mission.whyItMatters}</p>

          <div className="mt-3 rounded-xl border border-blue-200/70 bg-white/60 px-3 py-2.5 dark:border-blue-500/20 dark:bg-black/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Today’s forward move</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{mission.dailyAction}</p>
          </div>

          {momentum.movedToday ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <Check className="h-5 w-5 shrink-0 text-emerald-500" strokeWidth={3} />
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">You moved today.</p>
              {momentum.streak > 0 && (
                <span className="ml-auto flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                  <Flame className="h-3.5 w-3.5" />{momentum.streak}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={moveForward}
              disabled={moving}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <ArrowRight className="h-4 w-4" strokeWidth={3} /> I moved forward today
              {momentum.streak > 0 && <span className="flex items-center gap-0.5"><Flame className="h-4 w-4" />{momentum.streak}</span>}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlow({ title: 'Your mission', kind: 'define', steps: DEFINE_MISSION })}
          className="w-full rounded-2xl border border-dashed border-blue-300 p-5 text-center transition-colors hover:bg-blue-50 dark:border-blue-500/40 dark:hover:bg-blue-500/10"
        >
          <Compass className="mx-auto h-7 w-7 text-blue-500" />
          <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">Define your mission</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Your purpose, your why, your daily move. This is the fuel everything else runs on.</p>
        </button>
      )}

      {/* Today's session — adaptive + memory-aware (the headline daily action) */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() => runAiFlow('move toward my mission today', featured ?? PROTOCOLS[0])}
        color="text-blue-500"
        bg="border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10"
        subtitle="Pointed at your purpose and where you’re actually stuck."
      />

      {/* Mission protocols — guided runs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Mission protocols</p>
        <div className="space-y-2">
          {PROTOCOLS.map((p) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              color="text-blue-500"
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
