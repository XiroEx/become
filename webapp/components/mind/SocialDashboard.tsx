'use client'

// Social system dashboard — rebuilt on the shared SystemDashboard skeleton.
// Social is the ENVIRONMENT + RELATIONSHIPS dimension of the Mind arsenal: the
// people around you shape who you become, so build the circle on purpose and show
// up genuinely for others.
//
// Same count-based shape as Anti-Sabotage: a one-tap "I reached out" logs a
// connection (the daily-return hook + pride stat), interactive protocols run as
// GuidedFlows with the adaptive close, and the headline is the memory-aware
// adaptive session. No new backend — everything lands in MindJournal.

import { useCallback, useEffect, useState } from 'react'
import { Users, HeartHandshake, MessageCircle, UserPlus, TrendingUp } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { runAiTask } from '@/lib/ai/runClient'
import { validateGuidedSteps } from '@/lib/ai/sanitize'
import { SystemHero, ToolkitCard, TrackRecord, AdaptiveSession, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { reflectOnAnswers } from '@/lib/mind/reflect'
import { dailyPick } from '@/lib/mind/rotation'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#ec4899' // pink — social / relationships system color
const DONE_TEXT = 'That’s how circles change.'

// Rotating daily nudge for the "reach out" action.
const REACH_PROMPTS = [
  'Text someone you appreciate — tell them exactly why.',
  'Check in on someone you haven’t spoken to in a while.',
  'Ask someone about their day and actually listen.',
  'Thank someone who helped you recently.',
  'Reach out to one person who lifts you up.',
  'Send a message that has nothing to do with what you need.',
]

// ── Social protocols as guided runs (Become-voiced, never naming a source) ──
const PROTOCOLS: { id: string; title: string; blurb: string; Icon: typeof Users; steps: GuidedStep[] }[] = [
  {
    id: 'circle-audit', title: 'Circle Audit', blurb: 'Your environment is your fate. Know it.', Icon: Users,
    steps: [
      {
        title: 'Who pulls you UP?',
        inputPrompt: 'Who pulls you UP?',
        body: 'The people who leave you more driven, clearer, better. Name them.',
        placeholder: 'e.g. My training partner, my brother',
      },
      {
        title: 'Who pulls you DOWN?',
        inputPrompt: 'Who pulls you DOWN?',
        body: 'Honest — the ones who drain you or pull you off track. Just for you.',
        placeholder: 'e.g. The group that only wants to party',
      },
      {
        title: 'This week — which do you adjust?',
        body: 'You become the average of who you’re around. Move the dial one notch.',
        choices: ['More time with the first', 'Less time with the second', 'Both'],
      },
      { title: 'That’s the lever.', body: 'You can’t pick your whole world, but you choose where your hours go. Spend one more on the people who raise you.' },
    ],
  },
  {
    id: 'genuine-interest', title: 'Genuine Interest', blurb: 'People feel when you actually care.', Icon: HeartHandshake,
    steps: [
      { title: 'Connection isn’t about you.', body: 'The fastest way to matter to someone is to be genuinely interested in them.' },
      {
        title: 'Who could you really check on today?',
        inputPrompt: 'Who could you really check on today?',
        body: 'Not to get something — to ask about THEM and mean it.',
        placeholder: 'e.g. My friend who’s been going through it',
      },
      { title: 'Reach out. Ask, then listen.', body: 'One real question about their world. Then let them talk. That’s the whole move.' },
    ],
  },
  {
    id: 'hard-conversation', title: 'Hard Conversation', blurb: 'Avoiding it is the expensive option.', Icon: MessageCircle,
    steps: [
      {
        title: 'What conversation are you avoiding?',
        inputPrompt: 'What conversation are you avoiding?',
        body: 'The one you keep pushing off. Name it plainly.',
        placeholder: 'e.g. Telling a friend their comments hurt',
      },
      {
        title: 'The honest thing you need to say.',
        inputPrompt: 'The honest thing you need to say.',
        body: 'In one or two sentences — kind, but true.',
        placeholder: 'e.g. “When you joke about my goals it stings — I need you in my corner.”',
      },
      { title: 'Say it — kindly and directly.', body: 'Avoidance costs more than the awkward five minutes. The relationship gets lighter the moment it’s said.' },
    ],
  },
  {
    id: 'raise-average', title: 'Raise Your Average', blurb: 'You’re the average of your five closest.', Icon: TrendingUp,
    steps: [
      { title: 'Average is contagious.', body: 'So is excellence. The people you’re around set the ceiling you think is normal.' },
      {
        title: 'Who would raise your average?',
        inputPrompt: 'Who would raise your average?',
        body: 'Someone whose standards or energy pull you up — how do you get more time with them?',
        placeholder: 'e.g. Ask the guy who’s consistent to train together',
      },
      { title: 'Go make the ask.', body: 'Proximity is a choice. Get closer to the people already living what you want.' },
    ],
  },
  {
    id: 'set-standard', title: 'Set the Standard', blurb: 'Influence flows both ways — you shape them too.', Icon: UserPlus,
    steps: [
      { title: 'You’re someone’s environment too.', body: 'The way you show up raises or lowers the people around you. That’s power.' },
      {
        title: 'How do you want to show up for them?',
        inputPrompt: 'How do you want to show up for them?',
        body: 'The kind of presence you want to be for the people you love.',
        placeholder: 'e.g. Dependable, encouraging, the one who shows up',
      },
      { title: 'Be that today.', body: 'Lead by living it. The circle rises when someone in it decides to.' },
    ],
  },
]

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function SocialDashboard() {
  const { toast, showToast } = useToast()
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  // Lifetime reps in this tool — 1 + reps protocols are open.
  const [reps, setReps] = useState(0)
  const [connections, setConnections] = useState(0)
  const [reachedToday, setReachedToday] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [reaching, setReaching] = useState(false)
  const [flow, setFlow] = useState<{ title: string; steps: GuidedStep[]; aiGenerated?: boolean } | null>(null)
  // Cooldown so the reach-out can't be tapped into a meaningless number.
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mind/journal?system=social&limit=8', { headers: authHeaders() })
      if (!res.ok) return
      const d = await res.json()
      const raw: Array<{ _id: string; title: string; kind: string; createdAt: string }> = d.entries ?? []
      setEntries(raw.map((e) => ({ id: String(e._id), title: e.title, kind: e.kind, createdAt: e.createdAt })))
      setConnections(d.counts?.['connect'] ?? 0)
      setReps(Object.values((d.counts ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0))
      const todayStr = new Date().toDateString()
      setReachedToday(raw.some((e) => e.kind === 'connect' && new Date(e.createdAt).toDateString() === todayStr))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (kind: string, title: string, lines: { prompt: string; answer: string }[]) => {
    try {
      await fetch('/api/mind/journal', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ system: 'social', kind, title, lines }),
      })
      load()
    } catch { /* ignore */ }
  }

  // One-tap connection log — the pride stat + daily hook. Cooldown-gated so real
  // outreach counts but it can't be spammed.
  const REACH_COOLDOWN_S = 30
  const markReached = async () => {
    if (reaching || cooldown > 0) return
    setReaching(true)
    setConnections((c) => c + 1) // optimistic
    setReachedToday(true)
    setCooldown(REACH_COOLDOWN_S)
    showToast('That’s a real connection. Keep the circle warm. 🤝', 'success')
    await save('connect', 'Reached out to someone', [])
    setReaching(false)
  }

  const runAiFlow = async (topic: string, fallback: typeof PROTOCOLS[0]) => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const r = await runAiTask('/api/ai/mind/flow', { system: 'social', topic })
      const steps = validateGuidedSteps((r.result as { steps?: unknown } | undefined)?.steps)
      if (r.ok && steps) { setFlow({ title: topic, steps, aiGenerated: true }); return }
    } catch { /* fall through */ }
    showToast("Using today's protocol", 'neutral')
    setFlow({ title: fallback.title, steps: fallback.steps })
  }

  const reachPrompt = dailyPick(REACH_PROMPTS, 6) ?? REACH_PROMPTS[0]
  const featured = dailyPick(PROTOCOLS, 6)

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENT}
        doneText={DONE_TEXT}
        onReflect={flow.aiGenerated ? undefined : (a) => reflectOnAnswers('Social session', a)}
        onExit={() => { setFlow(null); setAiLoading(false) }}
        onComplete={(answers) => {
          const title = flow.title
          setFlow(null); setAiLoading(false)
          showToast('Logged to your track record', 'success')
          save('protocol', title, answers)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <SystemHero
        Icon={Users}
        title="Social"
        tagline="Your environment is your fate — build the circle on purpose"
        statValue={connections}
        statLabel="connections"
        color="text-pink-500"
        bg="bg-pink-50 dark:bg-pink-500/10"
      />

      {/* ── Reach out today — the daily-return hook ── */}
      <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4 dark:border-pink-500/30 dark:bg-pink-500/10">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-500">Reach out today</p>
        <p className="mt-2 text-base font-bold leading-snug text-zinc-900 dark:text-white">{reachPrompt}</p>
        {reachedToday ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <HeartHandshake className="h-5 w-5 shrink-0 text-emerald-500" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">You reached out today.</p>
            <span className="ml-auto text-xs font-semibold text-zinc-400">{connections} total</span>
          </div>
        ) : (
          <button
            onClick={markReached}
            disabled={reaching || cooldown > 0}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-transform active:scale-[0.98] ${
              cooldown > 0 ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500' : 'bg-pink-500 text-white'
            }`}
          >
            <HeartHandshake className="h-4 w-4" />
            {cooldown > 0 ? `Logged — stay connected (${cooldown}s)` : 'I reached out'}
          </button>
        )}
      </div>

      {/* Today's session — adaptive + memory-aware (the headline daily action) */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() => runAiFlow('strengthen the relationships and environment around me', featured ?? PROTOCOLS[0])}
        color="text-pink-500"
        bg="border-pink-200 bg-pink-50 dark:border-pink-500/30 dark:bg-pink-500/10"
        subtitle="Built from your circle and where you want to go."
      />

      {/* Social protocols — guided runs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Social protocols</p>
        <div className="space-y-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              color="text-pink-500"
              locked={i >= 1 + reps}
              lockedHint={`Locked — do ${i - reps} more rep${i - reps === 1 ? '' : 's'} in Social to unlock`}
              onClick={() => setFlow({ title: p.title, steps: p.steps })}
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
