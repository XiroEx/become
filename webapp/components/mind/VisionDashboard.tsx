'use client'

// Vision system dashboard — the POWERHOUSE of the Mind arsenal. Vision is the
// future version of yourself across every domain: habits, mind, body,
// relationships, environment. Together with Mission (why you move) it fuels the
// whole section — its answers are pushed into the AI grounding, so every other
// segment reasons from where the user is headed.
//
// Built on the shared SystemDashboard skeleton. Signature mechanic: your standing
// multi-domain Vision + a daily alignment check ("how aligned was today with the
// future you?") — the daily-return hook. Protocols run as GuidedFlows with the
// adaptive close; the headline is the memory-aware adaptive session.

import { useCallback, useEffect, useState } from 'react'
import { Telescope, Repeat, Brain, Dumbbell, Users, Home, Eye, Target, Check, Pencil, ArrowRight, type LucideIcon } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { runAiTask } from '@/lib/ai/runClient'
import { validateGuidedSteps } from '@/lib/ai/sanitize'
import { SystemHero, ToolkitCard, TrackRecord, AdaptiveSession, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { reflectOnAnswers } from '@/lib/mind/reflect'
import { dailyPick } from '@/lib/mind/rotation'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#10b981' // emerald — vision / future-self system color
const DONE_TEXT = 'The future, coming into focus.'

type DomainKey = 'habits' | 'mind' | 'body' | 'relationships' | 'environment'
const DOMAINS: { key: DomainKey; label: string; Icon: LucideIcon; prompt: string; placeholder: string }[] = [
  { key: 'body', label: 'Body', Icon: Dumbbell, prompt: 'Your body — the future you', placeholder: 'e.g. Lean, strong, and energized — I move like an athlete' },
  { key: 'mind', label: 'Mind', Icon: Brain, prompt: 'Your mind — the future you', placeholder: 'e.g. Calm, focused, in control of my thoughts' },
  { key: 'habits', label: 'Habits', Icon: Repeat, prompt: 'Your habits — the future you', placeholder: 'e.g. I train, plan, and sleep on schedule without negotiating' },
  { key: 'relationships', label: 'Relationships', Icon: Users, prompt: 'Your relationships — the future you', placeholder: 'e.g. Present and dependable — the people I love can count on me' },
  { key: 'environment', label: 'Environment', Icon: Home, prompt: 'Your environment — the future you', placeholder: 'e.g. Ordered space and people who pull me up, not down' },
]

// ── Vision protocols as guided runs (Become-voiced, never naming a source) ──
const PROTOCOLS: { id: string; title: string; blurb: string; Icon: LucideIcon; steps: GuidedStep[] }[] = [
  {
    id: 'see-future-you', title: 'See the Future You', blurb: 'Rehearse being them until it’s real.', Icon: Eye,
    steps: [
      { title: 'Twelve months from now.', body: 'Close your eyes for a moment. Not what you have — how you move, speak, and carry yourself.' },
      {
        title: 'Describe a normal day as that person.',
        inputPrompt: 'Describe a normal day as that person.',
        body: 'Present tense, like it’s already happening. Wake-up to wind-down.',
        placeholder: 'e.g. I wake early, train, do focused work, and end the day proud',
      },
      { title: 'You just rehearsed it.', body: 'Your nervous system can’t tell rehearsal from real. Carry one piece of that day into this one.' },
    ],
  },
  {
    id: 'which-domain', title: 'Which Domain Needs You?', blurb: 'Aim this week at the part that’s furthest behind.', Icon: Target,
    steps: [
      {
        title: 'Which part of your vision is furthest behind?',
        body: 'The domain where today looks least like the future you.',
        choices: ['Body', 'Mind', 'Habits', 'Relationships', 'Environment'],
      },
      {
        title: 'One move in that area this week.',
        inputPrompt: 'One move in that area this week.',
        body: 'Small and specific. It just has to close the gap a little.',
        placeholder: 'e.g. Two extra training sessions; call my brother',
      },
      { title: 'That’s the lever.', body: 'You don’t improve everything at once — you aim at the domain that moves the whole picture. Go do that one.' },
    ],
  },
  {
    id: 'close-the-gap', title: 'Close the Gap', blurb: 'Where does now differ most from the vision?', Icon: ArrowRight,
    steps: [
      {
        title: 'The biggest gap between now and the vision.',
        inputPrompt: 'The biggest gap between now and the vision.',
        body: 'Name the honest distance between who you are and who you described.',
        placeholder: 'e.g. I say I’m disciplined but I skip when it’s hard',
      },
      {
        title: 'One thing this week to close it.',
        inputPrompt: 'One thing this week to close it.',
        body: 'Not the whole gap — the first real step across it.',
        placeholder: 'e.g. Show up on the two days I always skip',
      },
      { title: 'The gap closes by steps.', body: 'Every time you act like the future you when it’s hard, the distance shrinks. Take that step.' },
    ],
  },
  {
    id: 'act-from-vision', title: 'Act From the Vision', blurb: 'Make one choice the future you would make.', Icon: Check,
    steps: [
      {
        title: 'One decision the future you would make today.',
        inputPrompt: 'One decision the future you would make today.',
        body: 'In the next few hours — how they’d eat, respond, or spend the time.',
        placeholder: 'e.g. Prep tomorrow’s session instead of scrolling',
      },
      { title: 'Go make it.', body: 'You become them one aligned choice at a time. This is one. Make it now.' },
    ],
  },
]

const IDENTITY_STEP: GuidedStep = {
  title: 'In one line — who are you becoming?',
  inputPrompt: 'In one line — who are you becoming?',
  body: 'The headline of your future self. Everything else is the detail underneath it.',
  placeholder: 'e.g. A disciplined, present leader people can count on',
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

interface VisionData { identityStatement: string; habits: string; mind: string; body: string; relationships: string; environment: string; completedAt?: string }
interface AlignData { avg7: number; entries7: number; todayScore: number | null; checkedToday: boolean }
type VisionForm = { identityStatement: string } & Record<DomainKey, string>
const EMPTY_FORM: VisionForm = { identityStatement: '', body: '', mind: '', habits: '', relationships: '', environment: '' }

export default function VisionDashboard() {
  const { toast, showToast } = useToast()
  const [vision, setVision] = useState<VisionData | null>(null)
  const [align, setAlign] = useState<AlignData>({ avg7: 0, entries7: 0, todayScore: null, checkedToday: false })
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  // Lifetime reps in this tool — 1 + reps protocols are open.
  const [reps, setReps] = useState(0)
  const [aiLoading, setAiLoading] = useState(false)
  const [aligning, setAligning] = useState(false)
  const [flow, setFlow] = useState<{ title: string; steps: GuidedStep[]; aiGenerated?: boolean } | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<VisionForm>(EMPTY_FORM)

  const hasVision = !!(vision && vision.identityStatement)

  const load = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset()
      const [vr, jr] = await Promise.all([
        fetch(`/api/mind/vision?tz=${tz}`, { headers: authHeaders() }),
        fetch('/api/mind/journal?system=vision&limit=8', { headers: authHeaders() }),
      ])
      if (vr.ok) {
        const d = await vr.json()
        setVision(d.vision ?? null)
        if (d.alignment) setAlign(d.alignment)
      }
      if (jr.ok) {
        const jd = await jr.json()
        const raw: Array<{ _id: string; title: string; kind: string; createdAt: string }> = jd.entries ?? []
        setEntries(raw.map((e) => ({ id: String(e._id), title: e.title, kind: e.kind, createdAt: e.createdAt })))
        setReps(Object.values((jd.counts ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (title: string, lines: { prompt: string; answer: string }[]) => {
    try {
      await fetch('/api/mind/journal', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ system: 'vision', kind: 'protocol', title, lines }),
      })
      load()
    } catch { /* ignore */ }
  }

  const openEditor = () => {
    setForm(vision
      ? { identityStatement: vision.identityStatement, body: vision.body, mind: vision.mind, habits: vision.habits, relationships: vision.relationships, environment: vision.environment }
      : EMPTY_FORM)
    setEditing(true)
  }

  const submitVision = async () => {
    const payload = {
      identityStatement: form.identityStatement.trim(),
      body: form.body.trim(), mind: form.mind.trim(), habits: form.habits.trim(),
      relationships: form.relationships.trim(), environment: form.environment.trim(),
    }
    if (!payload.identityStatement || DOMAINS.some((d) => !payload[d.key])) {
      showToast('Fill in your statement and all five domains', 'error'); return
    }
    try {
      const res = await fetch('/api/mind/vision', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
      if (res.ok) { showToast('That’s your vision. Now live toward it. 🔭', 'success'); setEditing(false); load() }
      else showToast('Could not save', 'error')
    } catch { showToast('Could not save', 'error') }
  }

  // Daily alignment check — the vision's daily-return hook. Idempotent per day.
  const setAlignment = async (score: number) => {
    if (aligning) return
    setAligning(true)
    setAlign((a) => ({ ...a, todayScore: score, checkedToday: true })) // optimistic
    try {
      const tz = new Date().getTimezoneOffset()
      const r = await fetch('/api/mind/vision', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ action: 'align', score, tz }) })
      if (r.ok) { const d = await r.json(); if (d.alignment) setAlign(d.alignment) }
      showToast(score >= 4 ? 'Aligned. Keep pointing at it. 🔭' : 'Noted. Tomorrow, aim one hour at the vision.', 'success')
    } catch { /* ignore */ }
    setAligning(false)
  }

  const runAiFlow = async (topic: string, fallback: typeof PROTOCOLS[0]) => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const r = await runAiTask('/api/ai/mind/flow', { system: 'vision', topic })
      const steps = validateGuidedSteps((r.result as { steps?: unknown } | undefined)?.steps)
      if (r.ok && steps) { setFlow({ title: topic, steps, aiGenerated: true }); return }
    } catch { /* fall through */ }
    showToast("Using today's protocol", 'neutral')
    setFlow({ title: fallback.title, steps: fallback.steps })
  }

  const featured = dailyPick(PROTOCOLS, 5)

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENT}
        doneText={DONE_TEXT}
        onReflect={flow.aiGenerated ? undefined : (a) => reflectOnAnswers('Vision session', a)}
        onExit={() => { setFlow(null); setAiLoading(false) }}
        onComplete={(answers) => {
          const title = flow.title
          setFlow(null); setAiLoading(false)
          showToast('Logged to your track record', 'success')
          save(title, answers)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <SystemHero
        Icon={Telescope}
        title="Vision"
        tagline="The future you — habits, mind, body, and life"
        statValue={hasVision && align.entries7 > 0 ? `${align.avg7}` : '—'}
        statLabel="aligned"
        color="text-emerald-500"
        bg="bg-emerald-50 dark:bg-emerald-500/10"
      />

      {/* ── Your Vision — the powerhouse ── */}
      {editing ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-500">{hasVision ? 'Edit your vision' : 'Paint your vision'}</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Who you’re becoming (one line)</label>
              <textarea
                value={form.identityStatement}
                onChange={(e) => setForm((f) => ({ ...f, identityStatement: e.target.value }))}
                rows={2}
                placeholder={IDENTITY_STEP.placeholder}
                className="w-full resize-none rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-400 focus:outline-none dark:border-emerald-500/30 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
              />
            </div>
            {DOMAINS.map((d) => (
              <div key={d.key}>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"><d.Icon className="h-3.5 w-3.5" /> {d.label}</label>
                <textarea
                  value={form[d.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [d.key]: e.target.value }))}
                  rows={2}
                  placeholder={d.placeholder}
                  className="w-full resize-none rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-400 focus:outline-none dark:border-emerald-500/30 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={submitVision} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.98]">Save vision</button>
            {hasVision && <button onClick={() => setEditing(false)} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-500 transition-colors hover:bg-white dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">Cancel</button>}
          </div>
        </div>
      ) : hasVision ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500">The future you</p>
            <button onClick={openEditor} aria-label="Edit vision" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-500 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-500/20">
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-base font-bold leading-snug text-zinc-900 dark:text-white">{vision!.identityStatement}</p>

          <div className="mt-3 space-y-1.5">
            {DOMAINS.map((d) => vision![d.key] ? (
              <div key={d.key} className="flex items-start gap-2.5 rounded-xl border border-emerald-200/70 bg-white/60 px-3 py-2 dark:border-emerald-500/20 dark:bg-black/20">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"><d.Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">{d.label}</p>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">{vision![d.key]}</p>
                </div>
              </div>
            ) : null)}
          </div>

          {/* Daily alignment check — the vision's daily-return hook */}
          <div className="mt-3 rounded-xl border border-emerald-200/70 bg-white/60 px-3 py-2.5 dark:border-emerald-500/20 dark:bg-black/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
              {align.checkedToday ? `Today’s alignment · ${align.todayScore}/5` : 'How aligned was today with the vision?'}
            </p>
            <div className="mt-2 flex items-center justify-between gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setAlignment(n)}
                  disabled={aligning}
                  className={`flex h-10 flex-1 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                    align.todayScore === n ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-emerald-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-emerald-500/15'
                  }`}
                >{n}</button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400"><span>Off track</span><span>Living it</span></div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openEditor}
          className="w-full rounded-2xl border border-dashed border-emerald-300 p-5 text-center transition-colors hover:bg-emerald-50 dark:border-emerald-500/40 dark:hover:bg-emerald-500/10"
        >
          <Telescope className="mx-auto h-7 w-7 text-emerald-500" />
          <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">Paint your vision</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">The future you across body, mind, habits, relationships, and environment. This is the powerhouse everything else runs on.</p>
        </button>
      )}

      {/* Today's session — adaptive + memory-aware (the headline daily action) */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() => runAiFlow('move toward the future version of me', featured ?? PROTOCOLS[0])}
        color="text-emerald-500"
        bg="border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
        subtitle="Built from the future you and where you are right now."
      />

      {/* Vision protocols — guided runs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Vision protocols</p>
        <div className="space-y-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              color="text-emerald-500"
              locked={i >= 1 + reps}
              lockedHint={`${i - reps} more rep${i - reps === 1 ? '' : 's'} to unlock`}
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
