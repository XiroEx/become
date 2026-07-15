'use client'

// Self-Image system dashboard — rebuilt on the shared SystemDashboard skeleton.
// The Mind arsenal's identity tool: kill the old self, install the new one.
//
// Its PRIMARY, distinct mechanic is "Who you're becoming" — a standing
// current-self → future-self identity (the IdentityProfile) with (a) a daily
// AFFIRMATION that builds a breakable streak (identity installation through
// repetition, the daily-return hook) and (b) an EVOLUTION score that grows from
// real behavior across the whole app (discipline challenges, states, mission).
// Plus interactive identity protocols, an evidence wall, and AI personalization.

import { useCallback, useEffect, useState } from 'react'
import { Fingerprint, Flame, Eye, Sparkles, ShieldCheck, RefreshCcw, Skull, Check, Plus, TrendingUp } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { runAiTask } from '@/lib/ai/runClient'
import { validateGuidedSteps } from '@/lib/ai/sanitize'
import { SystemHero, ToolkitCard, TrackRecord, AdaptiveSession, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { dailyPick } from '@/lib/mind/rotation'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#8b5cf6' // violet — self-image / identity system color
const DONE_TEXT = 'That’s who you are now.' // self-image–specific finish line

// ── Identity protocols as guided runs (Become-voiced, never naming a source) ──

const PROTOCOLS: { id: string; title: string; blurb: string; Icon: typeof Eye; steps: GuidedStep[] }[] = [
  {
    id: 'kill-the-old', title: 'Kill the Old Version', blurb: 'The old you would stop here. You don’t.', Icon: Skull,
    steps: [
      {
        title: 'Where does the old you show up most?',
        body: 'The version that quits, makes excuses, settles. Pick where it strikes.',
        choices: ['First sign of discomfort', 'When it stops being fun', 'When no one’s watching', 'When you’re tired'],
      },
      {
        title: 'What does the old you do there?',
        inputPrompt: 'What does the old you do there?',
        body: 'Name the exact move — the skip, the scroll, the excuse. See it clearly.',
        placeholder: 'e.g. Tells myself I’ll start tomorrow',
      },
      { title: 'Now do the opposite.', body: 'You just watched the old you. The new you acts now — one choice, the other direction. Go make it.' },
    ],
  },
  {
    id: 'future-self', title: 'Future Self', blurb: 'See it clearly. Then become it.', Icon: Eye,
    steps: [
      { title: 'Twelve months out.', body: 'Close your eyes for a moment. Not what you have — how you move, speak, and carry yourself.' },
      {
        title: 'Who are you then?',
        inputPrompt: 'Who are you then?',
        body: 'Describe that person in the present tense, like they’re already here.',
        placeholder: 'e.g. I train without negotiating. I keep my word to myself.',
      },
      { title: 'You just rehearsed being them.', body: 'Your nervous system can’t tell rehearsal from real. Carry one thing about them into the next hour.' },
    ],
  },
  {
    id: 'identity-install', title: 'Identity Installation', blurb: 'I do what I say I will do.', Icon: Fingerprint,
    steps: [
      {
        title: 'How true does it feel right now?',
        body: '“I do what I say I will do.” Rate it honestly — no wrong answer.',
        scale: { min: 1, max: 5, minLabel: 'Not yet', maxLabel: 'Dead certain' },
      },
      { title: 'Say it as a fact.', body: 'Not a wish — a fact. Repeat it slowly, ten times, before you move. Every rep installs it deeper.' },
    ],
  },
  {
    id: 'act-as-if', title: 'Act As If', blurb: 'Act like who you’re becoming until you are them.', Icon: Sparkles,
    steps: [
      {
        title: 'One decision your future self would make.',
        inputPrompt: 'One decision your future self would make.',
        body: 'In the next hour — how they’d eat, respond, or spend the time. Name one.',
        placeholder: 'e.g. Prep tomorrow’s session tonight instead of doomscrolling',
      },
      { title: 'Go make that one.', body: 'That’s how you become them — one aligned choice, then another. Not someday. Now.' },
    ],
  },
  {
    id: 'self-respect', title: 'Self-Respect Check', blurb: 'Would your future self respect this?', Icon: ShieldCheck,
    steps: [
      {
        title: 'What’s the next choice you’re about to make?',
        inputPrompt: 'What’s the next choice you’re about to make?',
        body: 'What you eat, how you spend the next hour, whether you skip the thing you planned.',
        placeholder: 'e.g. Skip the workout because I’m low energy',
      },
      {
        title: 'Would your future self respect it?',
        body: 'Be honest. This is the whole game.',
        choices: ['Yes — they’d be proud', 'No — that’s comfort talking', 'Not sure yet'],
      },
      { title: 'You already know.', body: 'Make the choice you’ll respect tonight. That respect is the identity, compounding.' },
    ],
  },
  {
    id: 'rewrite-story', title: 'Rewrite the Story', blurb: 'The story you believe becomes true.', Icon: RefreshCcw,
    steps: [
      {
        title: 'What limiting belief runs in the background?',
        inputPrompt: 'What limiting belief runs in the background?',
        body: 'The quiet one that stops you before you start.',
        placeholder: 'e.g. I always quit when it gets hard',
      },
      {
        title: 'Where have you already proved it wrong?',
        inputPrompt: 'Where have you already proved it wrong?',
        body: 'One real example. Even small. Evidence beats affirmation.',
        placeholder: 'e.g. I finished that 6-week block when I wanted to quit',
      },
      {
        title: 'Write the new story.',
        inputPrompt: 'Write the new story.',
        body: 'Present tense. Confident. Built on the evidence you just named.',
        placeholder: 'e.g. I’m someone who finishes what I start, even when it’s hard',
      },
      { title: 'That’s what you operate from now.', body: 'Read it back when the old story shows up. It will. You’ll be ready.' },
    ],
  },
]

// ── Define-your-identity flow (writes the IdentityProfile via PUT) ────────────
// Choice labels map back to the API enums; keep these arrays and the maps in sync.
const START_CHOICES = ['Starting from zero', 'Feeling stuck', 'Building momentum', 'Leveling up']
const START_MAP: Record<string, string> = {
  'Starting from zero': 'lost', 'Feeling stuck': 'stuck', 'Building momentum': 'building', 'Leveling up': 'leveling_up',
}
const CURRENT_SELF_MAP: Record<string, string> = {
  lost: 'I’m starting from scratch and figuring it out.',
  stuck: 'I know what to do but keep getting in my own way.',
  building: 'I’ve got momentum and I’m building on it.',
  leveling_up: 'I’m already moving and I want the next level.',
}
const OBSTACLE_CHOICES = ['I don’t know what I want', 'I can’t stay consistent', 'I lose motivation', 'My environment drags me down']
const OBSTACLE_MAP: Record<string, string> = {
  'I don’t know what I want': 'clarity', 'I can’t stay consistent': 'discipline',
  'I lose motivation': 'motivation', 'My environment drags me down': 'environment',
}
const DEFINE_IDENTITY: GuidedStep[] = [
  { title: 'Where are you starting from?', body: 'No wrong answer — just be honest about today.', choices: START_CHOICES },
  {
    title: 'Who are you becoming?',
    inputPrompt: 'Who are you becoming?',
    body: 'The person on the other side of this work. Present tense — like they’re already here.',
    placeholder: 'e.g. Someone who trains without negotiating and keeps their word',
  },
  { title: 'What gets in the way most?', body: 'The thing that pulls you off track more than anything else.', choices: OBSTACLE_CHOICES },
  { title: 'That’s the line you’re crossing.', body: 'From who you were to who you’re becoming. We’ll build the evidence together.' },
]

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

interface IdentityProfileData { currentSelf: string; futureSelf: string; evolutionScore: number }
interface AffirmData { streak: number; longest: number; affirmedToday: boolean }
interface Win { win: string; date?: string }

export default function SelfImageDashboard() {
  const { toast, showToast } = useToast()
  const [profile, setProfile] = useState<IdentityProfileData | null>(null)
  const [affirm, setAffirm] = useState<AffirmData>({ streak: 0, longest: 0, affirmedToday: false })
  const [wins, setWins] = useState<Win[]>([])
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  const [winInput, setWinInput] = useState('')
  const [savingWin, setSavingWin] = useState(false)
  const [affirming, setAffirming] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [flow, setFlow] = useState<{ title: string; kind: string; steps: GuidedStep[] } | null>(null)

  const load = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset()
      const [ir, wr, jr] = await Promise.all([
        fetch(`/api/mind/identity?tz=${tz}`, { headers: authHeaders() }),
        fetch('/api/mind/wins?limit=7', { headers: authHeaders() }),
        fetch('/api/mind/journal?system=self-image&limit=8', { headers: authHeaders() }),
      ])
      if (ir.ok) {
        const d = await ir.json()
        if (d.profile?.onboardingCompleted) {
          setProfile({ currentSelf: d.profile.currentSelf, futureSelf: d.profile.futureSelf, evolutionScore: d.evolution?.score ?? d.profile.evolutionScore ?? 0 })
        } else {
          setProfile(null)
        }
        if (d.affirm) setAffirm(d.affirm)
      }
      if (wr.ok) setWins((await wr.json()).wins ?? [])
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
        body: JSON.stringify({ system: 'self-image', kind, title, lines }),
      })
      load()
    } catch { /* ignore */ }
  }

  // Daily affirmation — the identity-installation hook. Optimistic; the streak
  // advances server-side (idempotent per day).
  const affirmToday = async () => {
    if (affirming || affirm.affirmedToday) return
    setAffirming(true)
    setAffirm((a) => ({ ...a, affirmedToday: true, streak: a.streak + 1 })) // optimistic
    showToast('Installed. That’s who you are now. 🧬', 'success')
    try {
      const tz = new Date().getTimezoneOffset()
      const r = await fetch('/api/mind/identity', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ action: 'affirm', tz }) })
      if (r.ok) { const d = await r.json(); if (d.affirm) setAffirm(d.affirm) }
    } catch { /* ignore */ }
    setAffirming(false)
  }

  // Create / update the identity from the define flow.
  const saveIdentity = async (answers: { prompt: string; answer: string }[]) => {
    const startLabel = answers[0]?.answer ?? ''
    const futureSelf = (answers[1]?.answer ?? '').trim()
    const obstacleLabel = answers[2]?.answer ?? ''
    const startingPoint = START_MAP[startLabel]
    const primaryObstacle = OBSTACLE_MAP[obstacleLabel]
    if (!startingPoint || !primaryObstacle || !futureSelf) { showToast('Something was missing — try again', 'error'); return }
    try {
      const res = await fetch('/api/mind/identity', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ currentSelf: CURRENT_SELF_MAP[startingPoint], futureSelf, primaryObstacle, startingPoint }),
      })
      if (res.ok) { showToast('This is who you’re becoming. Now affirm it daily. 🧬', 'success'); load() }
      else showToast('Could not save', 'error')
    } catch { showToast('Could not save', 'error') }
  }

  const logWin = async () => {
    const win = winInput.trim()
    if (win.length < 3 || savingWin) return
    setSavingWin(true)
    setWins((prev) => [{ win }, ...prev].slice(0, 7)) // optimistic
    setWinInput('')
    showToast('Evidence logged. Proof you’re becoming them. ✅', 'success')
    try {
      await fetch('/api/mind/wins', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ win, tz: new Date().getTimezoneOffset() }) })
    } catch { /* ignore */ }
    setSavingWin(false)
  }

  const runAiFlow = async (topic: string, fallback: typeof PROTOCOLS[0]) => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const r = await runAiTask('/api/ai/mind/flow', { system: 'self-image', topic })
      const steps = validateGuidedSteps((r.result as { steps?: unknown } | undefined)?.steps)
      if (r.ok && steps) { setFlow({ title: topic, kind: 'protocol', steps }); return }
    } catch { /* fall through */ }
    showToast("Using today's protocol", 'neutral')
    setFlow({ title: fallback.title, kind: 'protocol', steps: fallback.steps })
  }

  const featured = dailyPick(PROTOCOLS, 2)

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENT}
        doneText={flow.kind === 'define' ? 'The line is drawn.' : DONE_TEXT}
        onExit={() => { setFlow(null); setAiLoading(false) }}
        onComplete={(answers) => {
          const kind = flow.kind
          setFlow(null); setAiLoading(false)
          if (kind === 'define') { saveIdentity(answers); return }
          showToast('Logged to your track record', 'success')
          save(kind, flow.title, answers)
        }}
      />
    )
  }

  const evo = profile?.evolutionScore ?? 0

  return (
    <div className="space-y-5">
      <SystemHero
        Icon={Fingerprint}
        title="Self-Image"
        tagline="Kill the old self — become the new one"
        statValue={profile ? evo : '—'}
        statLabel="evolution"
        color="text-violet-500"
        bg="bg-violet-50 dark:bg-violet-500/10"
      />

      {/* ── Who you're becoming — the distinct centerpiece ── */}
      {profile ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">Who you’re becoming</p>
          <p className="mt-2 text-base font-bold leading-snug text-zinc-900 dark:text-white">{profile.futureSelf}</p>
          <p className="mt-1 text-xs text-zinc-500 line-through dark:text-zinc-400">was: {profile.currentSelf}</p>

          {/* Evolution bar — grows from real behavior across the app */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Evolution</span>
              <span className="tabular-nums">{evo}/100</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-violet-200/60 dark:bg-violet-500/20">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${evo}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">Built by your real reps — challenges, check-ins, mission.</p>
          </div>

          {/* Daily affirmation — the identity-installation streak */}
          {affirm.affirmedToday ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <Check className="h-5 w-5 shrink-0 text-emerald-500" strokeWidth={3} />
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Affirmed today.</p>
              {affirm.streak > 0 && (
                <span className="ml-auto flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                  <Flame className="h-3.5 w-3.5" />{affirm.streak}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={affirmToday}
              disabled={affirming}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <Fingerprint className="h-4 w-4" /> This is me — affirm it
              {affirm.streak > 0 && <span className="flex items-center gap-0.5"><Flame className="h-4 w-4" />{affirm.streak}</span>}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlow({ title: 'Who you’re becoming', kind: 'define', steps: DEFINE_IDENTITY })}
          className="w-full rounded-2xl border border-dashed border-violet-300 p-5 text-center transition-colors hover:bg-violet-50 dark:border-violet-500/40 dark:hover:bg-violet-500/10"
        >
          <Fingerprint className="mx-auto h-7 w-7 text-violet-500" />
          <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">Define who you’re becoming</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Name your old self and your future self. Everything here builds on it.</p>
        </button>
      )}

      {/* Today's session — adaptive + memory-aware (the headline daily action) */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() => runAiFlow('become the person I said I would be', featured ?? PROTOCOLS[0])}
        color="text-violet-500"
        bg="border-violet-200 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10"
        subtitle="Shaped by who you’re becoming and your recent reflections."
      />

      {/* Evidence wall — proof the new identity is real */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Evidence wall</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={winInput}
            onChange={(e) => setWinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && logWin()}
            placeholder="One real win from today — “I did…”"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
          />
          <button
            onClick={logWin}
            disabled={savingWin || winInput.trim().length < 3}
            aria-label="Log evidence"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white transition-opacity disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
          </button>
        </div>
        {wins.length > 0 && (
          <div className="mt-2 space-y-2">
            {wins.map((w, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={3} />
                <p className="text-sm text-zinc-800 dark:text-zinc-200">{w.win}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Identity protocols — guided runs (today's featured one lives up top) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Identity protocols</p>
        <div className="space-y-2">
          {PROTOCOLS.map((p) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              color="text-violet-500"
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
