'use client'

// Anti-Sabotage system dashboard — rebuilt on the shared SystemDashboard
// skeleton. No dead text: interrupt protocols and fear breakdowns run as
// full-screen GuidedFlows; "I caught it" logs a pattern-catch in one tap;
// everything lands in the track record (MindJournal).

import { useCallback, useEffect, useState } from 'react'
import { Shield, Zap, Eye, Search, CircleSlash, RefreshCcw, Hand, Sparkles } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { runAiTask } from '@/lib/ai/runClient'
import { SystemHero, ToolkitCard, TrackRecord, DailyDrop, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { dailyPick } from '@/lib/mind/rotation'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#fb923c' // orange — anti-sabotage system color
const DONE_TEXT = 'Caught. That’s the skill.' // anti-sabotage-specific finish line

// ── Interrupt protocols as guided runs (Become-voiced) ────────────────────────

const PROTOCOLS: { id: string; title: string; blurb: string; Icon: typeof Zap; steps: GuidedStep[] }[] = [
  {
    id: 'pattern-recognition', title: 'Pattern Recognition', blurb: 'Name the pattern — it can’t survive the light.', Icon: Search,
    steps: [
      {
        title: 'Where does it usually hit?',
        body: 'Pick the moment your old pattern strikes the most.',
        choices: ['Right at the start', 'The messy middle', 'Just before the win', 'When no one’s watching'],
      },
      {
        title: 'What’s your pattern?',
        inputPrompt: 'What’s your pattern?',
        body: 'The exact feeling or trigger that makes you stop — in your words.',
        placeholder: 'e.g. I quit the second it stops being exciting',
      },
      { title: 'Now it’s named.', body: 'A pattern you can name is one you can see coming. Next time it starts, you’ll catch it.' },
    ],
  },
  {
    id: 'stop-lying', title: 'Stop Lying to Yourself', blurb: 'Self-deception is the most expensive habit.', Icon: Eye,
    steps: [
      { title: 'Sixty honest seconds.', body: 'Not about anyone else — about you. Your effort, your habits, your excuses.' },
      {
        title: 'Where are you fooling yourself?',
        inputPrompt: 'Where are you fooling yourself?',
        body: 'The thing you know isn’t true but keep telling yourself anyway.',
        placeholder: 'e.g. “I’ll start Monday”',
      },
      { title: 'You can’t fix what you won’t admit.', body: 'You just admitted it. That’s the hard part done.' },
    ],
  },
  {
    id: 'action-override', title: 'Action Override', blurb: 'You can’t think your way to action.', Icon: Zap,
    steps: [
      { title: 'Stop planning.', body: 'You’ve thought about this enough. Readiness is a myth.' },
      {
        title: 'What’s your smallest move?',
        inputPrompt: 'What’s your smallest move?',
        body: 'The tiniest physical action you can take toward it in the next 5 minutes.',
        placeholder: 'e.g. Open the doc and write one line',
      },
      { title: 'Go do it. Right now.', body: 'Close this, do the thing, come back. Motion creates momentum — nothing else does.' },
    ],
  },
  {
    id: 'break-the-loop', title: 'Break the Loop', blurb: 'Interrupt the signal, interrupt the loop.', Icon: RefreshCcw,
    steps: [
      { title: 'Change something physical.', body: 'Stand up. Different room. Ten push-ups. Glass of water. Pick one.' },
      { title: 'Do it now.', body: 'The loop you’re in is a signal pattern. You just scrambled it.' },
    ],
  },
]

// ── Fear breakdowns (journaled) ───────────────────────────────────────────────

const FEARS: { trigger: string; questions: string[] }[] = [
  {
    trigger: "I'm scared I'll fail",
    questions: [
      'What specifically do you think will go wrong?',
      'What is the actual worst case — and could you recover from it?',
      'What has you assume failure over success?',
      'What would you do if you knew you could not fail?',
    ],
  },
  {
    trigger: "I don't think I'm good enough",
    questions: [
      'Good enough compared to what standard?',
      'Was that standard set by you — or someone else?',
      'What evidence contradicts this belief?',
      'If a friend said this about themselves, what would you tell them?',
    ],
  },
  {
    trigger: "I'm afraid of what people will think",
    questions: [
      'Whose opinion, specifically, are you worried about?',
      'Do they control your outcomes — or just your feelings?',
      'If you succeed, will their opinion change?',
      'If they’re watching closely enough to judge, aren’t they impressed by the attempt?',
    ],
  },
  {
    trigger: "I don't have enough time",
    questions: [
      'How much time does this actually require per day?',
      'What are you spending time on that matters less?',
      'Is time the real constraint — or energy and clarity?',
      'What is the cost of NOT making time for this?',
    ],
  },
]

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function AntiSabotageDashboard() {
  const { toast, showToast } = useToast()
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  const [caught, setCaught] = useState(0)
  const [flow, setFlow] = useState<{ title: string; kind: string; steps: GuidedStep[] } | null>(null)
  const [catching, setCatching] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  // Cooldown so the catch can't be machine-gunned into a meaningless number —
  // real catches are spaced; this keeps the pride stat honest.
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mind/journal?system=anti-sabotage&limit=8', { headers: authHeaders() })
      if (!res.ok) return
      const d = await res.json()
      setEntries((d.entries ?? []).map((e: { _id: string; title: string; kind: string; createdAt: string }) => ({
        id: String(e._id), title: e.title, kind: e.kind, createdAt: e.createdAt,
      })))
      setCaught(d.counts?.['pattern-catch'] ?? 0)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (kind: string, title: string, lines: { prompt: string; answer: string }[]) => {
    try {
      await fetch('/api/mind/journal', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ system: 'anti-sabotage', kind, title, lines }),
      })
      load()
    } catch { /* ignore */ }
  }

  // One-tap pattern catch — the system's pride stat. Cooldown-gated so it can't
  // be spammed (you can log many real catches a day, just not all at once).
  const CATCH_COOLDOWN_S = 45
  const catchPattern = async () => {
    if (catching || cooldown > 0) return
    setCatching(true)
    setCaught((c) => c + 1) // optimistic
    setCooldown(CATCH_COOLDOWN_S)
    showToast('Caught it. That’s the whole skill. 🛡️', 'success')
    await save('pattern-catch', 'Caught a pattern mid-act', [])
    setCatching(false)
  }

  // Personalize with AI — calls /api/ai/mind/flow and launches the returned steps as
  // a guided flow. Falls back to the static featured interrupt on any failure.
  const runAiFlow = async (topic: string, fallbackProtocol: typeof PROTOCOLS[0] | undefined) => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const r = await runAiTask('/api/ai/mind/flow', { system: 'anti-sabotage', topic })
      const steps = (r.result as { steps?: GuidedStep[] } | undefined)?.steps
      if (r.ok && Array.isArray(steps) && steps.length > 0) {
        setFlow({ title: topic, kind: 'protocol', steps })
        return
      }
    } catch { /* fall through */ }
    // Fallback — launch the static protocol without surfacing an error
    showToast("Using today's protocol", 'neutral')
    if (fallbackProtocol) {
      setFlow({ title: fallbackProtocol.title, kind: 'protocol', steps: fallbackProtocol.steps })
    }
  }

  // Today's featured interrupt — excluded from the list below so it isn't shown twice.
  const featuredInterrupt = dailyPick(PROTOCOLS, 3)

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENT}
        doneText={DONE_TEXT}
        onExit={() => { setFlow(null); setAiLoading(false) }}
        onComplete={(answers) => {
          setFlow(null)
          setAiLoading(false)
          showToast('Logged to your track record', 'success')
          save(flow.kind, flow.title, answers)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <SystemHero
        Icon={Shield}
        title="Anti-Sabotage"
        tagline="Catch the pattern before it kills progress"
        statValue={caught}
        statLabel="patterns caught"
        color="text-orange-500"
        bg="bg-orange-50 dark:bg-orange-500/10"
      />

      {/* Daily drop — a fresh interrupt featured each day */}
      {featuredInterrupt && (
        <DailyDrop
          Icon={Sparkles}
          eyebrow="Today’s interrupt"
          title={featuredInterrupt.title}
          blurb={featuredInterrupt.blurb}
          ctaLabel="Run"
          color="text-orange-500"
          onClick={() => setFlow({ title: featuredInterrupt.title, kind: 'protocol', steps: featuredInterrupt.steps })}
        />
      )}

      {/* Personalize with AI — generates a flow tailored to the user’s current
          pattern. Falls back to the featured static protocol without hard-erroring. */}
      <button
        type="button"
        disabled={aiLoading}
        onClick={() => runAiFlow(
          featuredInterrupt?.title ?? 'interrupt a self-sabotage pattern',
          featuredInterrupt,
        )}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-300 py-3 text-sm font-semibold text-orange-500 transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-orange-500/30 dark:hover:bg-orange-500/10"
      >
        {aiLoading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Building your session…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Personalize with AI
          </>
        )}
      </button>

      {/* Do one now — the one-tap catch (cooldown-gated against spam) */}
      <button
        type="button"
        onClick={catchPattern}
        disabled={catching || cooldown > 0}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-transform active:scale-[0.98] ${
          cooldown > 0
            ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
            : 'bg-orange-500 text-white'
        }`}
      >
        <Hand className="h-5 w-5" />
        {cooldown > 0 ? `Caught — stay sharp (${cooldown}s)` : 'I caught myself doing it'}
      </button>
      <p className="-mt-3 text-center text-[11px] text-zinc-400">
        {cooldown > 0
          ? 'Logged. Catch the next one when it actually happens.'
          : 'Old pattern showed up and you noticed? Tap it. Noticing IS the win.'}
      </p>

      {/* Interrupt protocols — guided runs (today's featured one lives up top) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Interrupt protocols</p>
        <div className="space-y-2">
          {PROTOCOLS.filter((p) => p.id !== featuredInterrupt?.id).map((p) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              color="text-orange-500"
              onClick={() => setFlow({ title: p.title, kind: 'protocol', steps: p.steps })}
            />
          ))}
        </div>
      </div>

      {/* Fear breakdowns — journaled flows */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Break down a fear</p>
        <div className="space-y-2">
          {FEARS.map((f) => (
            <ToolkitCard
              key={f.trigger}
              Icon={CircleSlash}
              title={f.trigger}
              blurb="4 questions. Your answers get saved."
              color="text-orange-500"
              onClick={() => setFlow({
                title: f.trigger,
                kind: 'fear-breakdown',
                steps: f.questions.map((q, i) => ({
                  title: q,
                  inputPrompt: q,
                  body: i === 0 ? `Your fear: “${f.trigger}.” Answer each one honestly — this is just for you.` : undefined,
                  placeholder: 'Answer honestly — just for you…',
                })),
              })}
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
