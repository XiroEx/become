'use client'

// State Shift system dashboard — rebuilt on the shared SystemDashboard skeleton.
// The Mind arsenal's "snap back to now" tool: whatever you're in, do one thing
// and move your state for the better.
//
// PRIMARY, distinct mechanic: "Where's your head right now?" — name your current
// state and get routed straight into the matched reset (an animated breath
// session or a guided reset), so the check-in isn't a survey, it's the shift.
// The genuinely-interactive tools that made the old tab good are preserved: the
// animated breath sessions and the focus timer. Read-only protocol cards become
// GuidedFlows; everything lands in the track record.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Wind, Timer, Play, Pause, RotateCcw, X, Check, Waves, Focus, Zap, Activity, VolumeX } from 'lucide-react'
import GuidedFlow, { type GuidedStep } from '@/components/mind/system/GuidedFlow'
import { runAiTask } from '@/lib/ai/runClient'
import { validateGuidedSteps } from '@/lib/ai/sanitize'
import { SystemHero, ToolkitCard, TrackRecord, AdaptiveSession, type TrackRecordEntry } from '@/components/mind/system/SystemDashboard'
import { dailyPick } from '@/lib/mind/rotation'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

const ACCENT = '#06b6d4' // cyan — state-shift / reset system color
const DONE_TEXT = 'Back in the room.' // state-shift–specific finish line

// ── Animated breath protocols (the crown-jewel interactive tool) ──────────────

interface BreathPhase { label: string; durationMs: number; instruction: string }
interface BreathProtocol { id: string; name: string; tagline: string; bestFor: string; rounds: number; phases: BreathPhase[] }

const BREATH: BreathProtocol[] = [
  {
    id: 'physiological', name: 'Physiological Sigh', tagline: 'Fastest reset', bestFor: 'Instant stress relief', rounds: 3,
    phases: [
      { label: 'Inhale', durationMs: 2000, instruction: 'Breathe in through your nose' },
      { label: 'Inhale+', durationMs: 1000, instruction: 'Small extra sniff — fill your lungs completely' },
      { label: 'Exhale', durationMs: 6000, instruction: 'Long slow exhale through your mouth — fully empty' },
    ],
  },
  {
    id: 'box', name: 'Box Breathing', tagline: 'Steady & sharp', bestFor: 'Stress & pre-performance', rounds: 4,
    phases: [
      { label: 'Inhale', durationMs: 4000, instruction: 'Breathe in slowly through your nose' },
      { label: 'Hold', durationMs: 4000, instruction: 'Hold — lungs full' },
      { label: 'Exhale', durationMs: 4000, instruction: 'Breathe out slowly through your mouth' },
      { label: 'Hold', durationMs: 4000, instruction: 'Hold — lungs empty' },
    ],
  },
  {
    id: '478', name: '4-7-8', tagline: 'Deep calm', bestFor: 'Wind down & sleep', rounds: 4,
    phases: [
      { label: 'Inhale', durationMs: 4000, instruction: 'Breathe in quietly through your nose' },
      { label: 'Hold', durationMs: 7000, instruction: 'Hold your breath' },
      { label: 'Exhale', durationMs: 8000, instruction: 'Exhale completely through your mouth' },
    ],
  },
]

function BreathSession({ protocol, onExit, onDone }: { protocol: BreathProtocol; onExit: () => void; onDone: () => void }) {
  const [round, setRound] = useState(1)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAt = useRef<number>(0)
  const currentPhase = protocol.phases[phaseIdx]

  useEffect(() => {
    startedAt.current = performance.now()
    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAt.current
      const p = Math.min(elapsed / currentPhase.durationMs, 1)
      setProgress(p)
      if (p >= 1) {
        clearInterval(intervalRef.current!)
        const nextPhase = phaseIdx + 1
        if (nextPhase < protocol.phases.length) setPhaseIdx(nextPhase)
        else if (round + 1 <= protocol.rounds) { setRound(round + 1); setPhaseIdx(0) }
        else setDone(true)
        setProgress(0)
      }
    }, 50)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [phaseIdx, round, currentPhase?.durationMs, protocol.phases.length, protocol.rounds])

  const circumference = 2 * Math.PI * 56
  const dashOffset = circumference * (1 - progress)

  if (done) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black">
        <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${ACCENT}26` }}>
          <Check className="h-10 w-10" strokeWidth={3} style={{ color: ACCENT }} />
        </span>
        <p className="mb-1 text-lg font-bold text-white">{DONE_TEXT}</p>
        <p className="mb-8 text-sm text-white/50">{protocol.rounds} rounds complete</p>
        <button onClick={onDone} className="rounded-2xl bg-white px-8 py-3 font-semibold text-black">Finish</button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black px-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2" style={{ background: `radial-gradient(120% 70% at 50% 0%, ${ACCENT}26, transparent 70%)` }} />
      <button onClick={onExit} aria-label="Exit" className="absolute right-5 top-[calc(env(safe-area-inset-top,0px)+16px)] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70">
        <X className="h-5 w-5" />
      </button>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">{protocol.name}</p>
      <p className="mb-8 text-sm text-white/50">Round {round} of {protocol.rounds}</p>
      <div className="relative my-4">
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r="56" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
          <circle cx="70" cy="70" r="56" fill="none" stroke={ACCENT} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 50ms linear' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-2xl font-bold text-white">{currentPhase?.label}</p>
        </div>
      </div>
      <p className="mt-6 max-w-xs text-center text-sm leading-relaxed text-white/60">{currentPhase?.instruction}</p>
    </div>
  )
}

// ── Focus timer (preserved) ───────────────────────────────────────────────────

const FOCUS_DURATIONS = [
  { label: '5m', seconds: 5 * 60 }, { label: '10m', seconds: 10 * 60 },
  { label: '25m', seconds: 25 * 60 }, { label: '45m', seconds: 45 * 60 },
]

function FocusRow() {
  const [selectedSeconds, setSelectedSeconds] = useState(25 * 60)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => { if (r <= 1) { setRunning(false); setDone(true); return 0 } return r - 1 })
      }, 1000)
    } else if (intervalRef.current) clearInterval(intervalRef.current)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const select = (s: number) => { setSelectedSeconds(s); setRemaining(s); setRunning(false); setDone(false) }
  const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
  const secs = (remaining % 60).toString().padStart(2, '0')
  const progress = running || done ? 1 - remaining / selectedSeconds : 0

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-cyan-500" />
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Focus mode</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5">
          {FOCUS_DURATIONS.map((d) => (
            <button key={d.label} onClick={() => select(d.seconds)} disabled={running}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all disabled:pointer-events-none ${
                selectedSeconds === d.seconds ? 'bg-cyan-500 text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
              }`}>{d.label}</button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {(running || (remaining < selectedSeconds && !done)) && (
            <span className="w-12 text-center text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{mins}:{secs}</span>
          )}
          {done ? (
            <button onClick={() => select(selectedSeconds)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><Check className="h-4 w-4" strokeWidth={3} /></button>
          ) : running ? (
            <button onClick={() => setRunning(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"><Pause className="h-4 w-4" /></button>
          ) : (
            <button onClick={() => { setDone(false); setRunning(true) }} className="flex h-9 items-center gap-1.5 rounded-xl bg-cyan-500 px-3 text-xs font-bold text-white">
              <Play className="h-3.5 w-3.5" />{remaining < selectedSeconds ? 'Resume' : 'Start'}
            </button>
          )}
          {remaining < selectedSeconds && !running && !done && (
            <button onClick={() => { setRunning(false); setDone(false); setRemaining(selectedSeconds) }} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800"><RotateCcw className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      {(running || done || remaining < selectedSeconds) && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-cyan-500 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Reset protocols as guided runs (Become-voiced, never naming a source) ──────

const RESET_FLOWS: { id: string; title: string; blurb: string; Icon: typeof Wind; steps: GuidedStep[] }[] = [
  {
    id: 'name-next-action', title: 'Name the Next Action', blurb: 'What is the next action? Only that.', Icon: Focus,
    steps: [
      {
        title: 'What’s weighing on you right now?',
        inputPrompt: 'What’s weighing on you right now?',
        body: 'Dump the whole thing here — the pile that’s scrambling your head.',
        placeholder: 'e.g. Everything with the project feels behind',
      },
      {
        title: 'The one next physical action.',
        inputPrompt: 'The one next physical action.',
        body: 'Not the plan — the single move you can make in the next 10 minutes.',
        placeholder: 'e.g. Open the doc and write the first line',
      },
      { title: 'Do only that.', body: 'The rest waits. One action collapses the fog — the next one appears once you move.' },
    ],
  },
  {
    id: 'act-or-react', title: 'Act or React?', blurb: 'Are you choosing — or just responding?', Icon: Activity,
    steps: [
      {
        title: 'Right now — are you acting or reacting?',
        body: 'Be honest. Reacting is running someone else’s script.',
        choices: ['Choosing', 'Reacting', 'Not sure'],
      },
      {
        title: 'One conscious choice you can make.',
        inputPrompt: 'One conscious choice you can make.',
        body: 'Small is fine. It just has to be chosen, not automatic.',
        placeholder: 'e.g. Put the phone in the other room',
      },
      { title: 'Make it now.', body: 'That’s the snap back — one deliberate move, and you’re driving again.' },
    ],
  },
  {
    id: 'cut-the-noise', title: 'Cut the Noise', blurb: 'Silence is the sharpest tool.', Icon: VolumeX,
    steps: [
      { title: 'Phone face down. Every tab closed.', body: 'No input for the next minute. Nothing to react to.' },
      {
        title: 'Sixty seconds of nothing.',
        body: 'Set a timer if you need to. Just sit. Let the static settle.',
        scale: { min: 1, max: 5, minLabel: 'Still buzzing', maxLabel: 'Quiet' },
      },
      { title: 'Now the one thing that matters.', body: 'Head’s clearer. Move to it before the noise creeps back.' },
    ],
  },
  {
    id: 'move-to-shift', title: 'Move to Shift', blurb: 'Move the body, move the mind.', Icon: Zap,
    steps: [
      { title: 'You can’t feel low after you move.', body: 'State follows the body faster than it follows thought. Let’s use that.' },
      {
        title: 'Pick your move.',
        body: 'One of these, right now — not later.',
        choices: ['10 push-ups', '10 jumping jacks', 'Walk + 5 deep breaths', 'Shoulders back, big chest breath ×5'],
      },
      { title: 'Go. Come back moved.', body: 'Do it, then return. Notice your state is already different.' },
    ],
  },
  {
    id: 'snap-out', title: 'Snap Out of It', blurb: 'This is a moment, not your identity.', Icon: Waves,
    steps: [
      { title: 'This is a moment — not who you are.', body: 'The feeling is weather, not the sky. It’s already moving through.' },
      {
        title: 'What are you making it mean?',
        inputPrompt: 'What are you making it mean?',
        body: 'Name the story you’re attaching to the feeling. Seeing it loosens it.',
        placeholder: 'e.g. That one bad session means I’m falling off',
      },
      { title: 'Breathe it out — then choose.', body: '4 in, 4 hold, 4 out, three times. Say it once out loud: “This is a moment.” Then make your next move from the sky, not the weather.' },
    ],
  },
  {
    id: 'protect-the-state', title: 'Protect the State', blurb: 'You’re dialed in — don’t waste it.', Icon: Focus,
    steps: [
      { title: 'You’re locked in. This is rare fuel.', body: 'This is the state everything gets built in. Spend it on purpose.' },
      {
        title: 'What’s the one thing to attack now?',
        inputPrompt: 'What’s the one thing to attack now?',
        body: 'The highest-leverage thing your dialed-in self should hit while it lasts.',
        placeholder: 'e.g. The workout, then the hard task I’ve been dodging',
      },
      { title: 'Go — before it fades.', body: 'Close this and pour the state straight into that. Momentum protects momentum.' },
    ],
  },
]

// ── Current-state check-in → matched reset (the signature mechanic) ────────────
// `state` maps to the StateLog enum; `reset` is either an animated breath session
// or one of the guided reset flows above.
type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'
const STATES: { state: MindState; label: string; Icon: typeof Wind; reset: { breath: string } | { flow: string } }[] = [
  { state: 'stressed',   label: 'Stressed',  Icon: Waves,    reset: { breath: 'physiological' } },
  { state: 'distracted', label: 'Scattered', Icon: Focus,    reset: { flow: 'name-next-action' } },
  { state: 'low_energy', label: 'Drained',   Icon: Zap,      reset: { flow: 'move-to-shift' } },
  { state: 'locked_in',  label: 'Dialed in', Icon: Activity, reset: { flow: 'protect-the-state' } },
]

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function StateShiftDashboard() {
  const { toast, showToast } = useToast()
  const [entries, setEntries] = useState<TrackRecordEntry[]>([])
  const [shifts, setShifts] = useState(0)
  const [lastState, setLastState] = useState<MindState | null>(null)
  const [flow, setFlow] = useState<{ title: string; steps: GuidedStep[] } | null>(null)
  const [breath, setBreath] = useState<BreathProtocol | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const [sr, jr] = await Promise.all([
        fetch('/api/mind/state?limit=100', { headers: authHeaders() }),
        fetch('/api/mind/journal?system=state-shift&limit=8', { headers: authHeaders() }),
      ])
      if (sr.ok) {
        const logs: Array<{ state: MindState }> = (await sr.json()).logs ?? []
        setShifts(logs.length)
        if (logs[0]) setLastState(logs[0].state)
      }
      if (jr.ok) {
        const raw: Array<{ _id: string; title: string; kind: string; createdAt: string }> = (await jr.json()).entries ?? []
        setEntries(raw.map((e) => ({ id: String(e._id), title: e.title, kind: e.kind, createdAt: e.createdAt })))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (title: string, lines: { prompt: string; answer: string }[]) => {
    try {
      await fetch('/api/mind/journal', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ system: 'state-shift', kind: 'protocol', title, lines }),
      })
      load()
    } catch { /* ignore */ }
  }

  const openReset = (reset: { breath: string } | { flow: string }) => {
    if ('breath' in reset) {
      const p = BREATH.find((b) => b.id === reset.breath)
      if (p) setBreath(p)
    } else {
      const f = RESET_FLOWS.find((x) => x.id === reset.flow)
      if (f) setFlow({ title: f.title, steps: f.steps })
    }
  }

  // The signature action: name your state → log it (with lineage) → jump straight
  // into the matched reset. The check-in IS the shift, not a survey.
  const pickState = (s: typeof STATES[0]) => {
    setShifts((n) => n + 1) // optimistic
    const previous = lastState
    setLastState(s.state)
    fetch('/api/mind/state', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ state: s.state, ...(previous ? { previousState: previous } : {}) }),
    }).catch(() => {})
    openReset(s.reset)
  }

  const runAiFlow = async (topic: string, fallback: typeof RESET_FLOWS[0]) => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const r = await runAiTask('/api/ai/mind/flow', { system: 'state-shift', topic })
      const steps = validateGuidedSteps((r.result as { steps?: unknown } | undefined)?.steps)
      if (r.ok && steps) { setFlow({ title: topic, steps }); return }
    } catch { /* fall through */ }
    showToast("Using today's reset", 'neutral')
    setFlow({ title: fallback.title, steps: fallback.steps })
  }

  const featured = dailyPick(RESET_FLOWS, 1)

  if (breath) {
    return (
      <BreathSession
        protocol={breath}
        onExit={() => setBreath(null)}
        onDone={() => {
          const name = breath.name
          setBreath(null)
          showToast('Reset logged. You shifted it. 🌬️', 'success')
          save(name, [])
        }}
      />
    )
  }

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENT}
        doneText={DONE_TEXT}
        onExit={() => { setFlow(null); setAiLoading(false) }}
        onComplete={(answers) => {
          const title = flow.title
          setFlow(null); setAiLoading(false)
          showToast('Reset logged. You shifted it. 🌬️', 'success')
          save(title, answers)
        }}
      />
    )
  }

  const lastLabel = STATES.find((s) => s.state === lastState)?.label

  return (
    <div className="space-y-5">
      <SystemHero
        Icon={Wind}
        title="State Shift"
        tagline="Snap back to now — shift your state"
        statValue={shifts}
        statLabel="shifts"
        color="text-cyan-500"
        bg="bg-cyan-50 dark:bg-cyan-500/10"
      />

      {/* ── Where's your head right now? — the distinct centerpiece ── */}
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">Where’s your head right now?</p>
          {lastLabel && <span className="text-[11px] font-semibold text-zinc-400">last: {lastLabel}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {STATES.map((s) => (
            <button
              key={s.state}
              onClick={() => pickState(s)}
              className="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left transition-transform active:scale-[0.98] hover:border-cyan-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-cyan-500/40"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                <s.Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">{s.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">Name it and we’ll take you straight into the reset that fits.</p>
      </div>

      {/* Today's session — adaptive + memory-aware (the headline daily action) */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() => runAiFlow('shift my current state right now', featured ?? RESET_FLOWS[0])}
        color="text-cyan-500"
        bg="border-cyan-200 bg-cyan-50 dark:border-cyan-500/30 dark:bg-cyan-500/10"
        subtitle="A reset shaped by your recent state check-ins and reflections."
      />

      {/* Guided breathwork — the animated sessions */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Guided breathwork</p>
        <div className="space-y-2">
          {BREATH.map((b) => (
            <ToolkitCard
              key={b.id}
              Icon={Wind}
              title={b.name}
              blurb={`${b.rounds} rounds · ${b.bestFor}`}
              color="text-cyan-500"
              onClick={() => setBreath(b)}
            />
          ))}
        </div>
      </div>

      {/* Focus mode — the timer */}
      <FocusRow />

      {/* Reset protocols — guided runs (today's featured one lives up top) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Reset protocols</p>
        <div className="space-y-2">
          {RESET_FLOWS.filter((f) => f.id !== 'protect-the-state').map((f) => (
            <ToolkitCard
              key={f.id}
              Icon={f.Icon}
              title={f.title}
              blurb={f.blurb}
              color="text-cyan-500"
              onClick={() => setFlow({ title: f.title, steps: f.steps })}
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
