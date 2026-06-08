'use client'

// Mind Lab (admin) — exercise every modality + each variant on demand, browse the
// full content library, and build/play ad-hoc sessions. Everything runs in the
// real SessionPlayer with `preview` so NOTHING is written (no XP/streak/recency/
// state/win/discipline logs). See MIND_ADMIN_LAB.md for the spec.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FlaskConical, Play, Plus, X } from 'lucide-react'
import type { MindState } from '@/lib/mindContent'
import type { Move, MindSessionPlan, MoveKind, SessionContext } from '@/lib/mind/moves'
import { BREATH_PROTOCOLS } from '@/lib/mind/moves'
import { buildMove } from '@/lib/mind/composeSession'
import SessionPlayer from '@/components/mind/session/SessionPlayer'
import { MODALITIES, type ModalitySpec } from '@/lib/mind/modalities'
import SpeechMatchTester from './SpeechMatchTester'
import {
  IDENTITY_POOL, WIN_PROMPTS, INTROS, CHOICE_POOL, SABOTAGE_PATTERNS,
  ACCOUNTABILITY_ACTIONS, DISCIPLINE_CHALLENGES, COMPOSE_TEMPLATES,
  ACKNOWLEDGE_POOL, INTERROGATIVE_POOL, CONTRAST_OBSTACLES, CONTRAST_PLANS,
} from '@/lib/mind/library'

const STATES: MindState[] = ['stressed', 'distracted', 'low_energy', 'locked_in']
const PROTOCOLS = ['auto', ...Object.keys(BREATH_PROTOCOLS)]

interface Inputs {
  statement: string
  sentences: number
  protocol: string
  liveState: MindState | ''
  seed: number
  poolItem: number
}
const DEFAULT_INPUTS: Inputs = { statement: '', sentences: 0, protocol: 'auto', liveState: '', seed: 0, poolItem: 0 }

// Pools keyed by the registry's `pool` string — for the poolItem picker + library.
const POOLS: Record<string, unknown[]> = {
  IDENTITY_POOL, WIN_PROMPTS, CHOICE_POOL, SABOTAGE_PATTERNS, ACCOUNTABILITY_ACTIONS,
  DISCIPLINE_CHALLENGES, COMPOSE_TEMPLATES, ACKNOWLEDGE_POOL, INTERROGATIVE_POOL,
}
const LIBRARY: { key: string; label: string; items: unknown[] }[] = [
  { key: 'IDENTITY_POOL', label: 'Affirmations (identity / mirror)', items: IDENTITY_POOL },
  { key: 'COMPOSE_TEMPLATES', label: 'Fill-in templates', items: COMPOSE_TEMPLATES },
  { key: 'CHOICE_POOL', label: 'Reflections (choice)', items: CHOICE_POOL },
  { key: 'ACKNOWLEDGE_POOL', label: 'Acknowledge', items: ACKNOWLEDGE_POOL },
  { key: 'INTERROGATIVE_POOL', label: 'Interrogative', items: INTERROGATIVE_POOL },
  { key: 'WIN_PROMPTS', label: 'Win prompts', items: WIN_PROMPTS },
  { key: 'SABOTAGE_PATTERNS', label: 'Sabotage patterns', items: SABOTAGE_PATTERNS },
  { key: 'ACCOUNTABILITY_ACTIONS', label: 'Accountability actions', items: ACCOUNTABILITY_ACTIONS },
  { key: 'DISCIPLINE_CHALLENGES', label: 'Discipline challenges', items: DISCIPLINE_CHALLENGES },
  { key: 'CONTRAST_OBSTACLES', label: 'Contrast — obstacles', items: CONTRAST_OBSTACLES },
  { key: 'CONTRAST_PLANS', label: 'Contrast — if-then plans', items: CONTRAST_PLANS },
  { key: 'INTROS', label: 'Session intros', items: INTROS },
  { key: 'BREATH_PROTOCOLS', label: 'Breath protocols', items: Object.values(BREATH_PROTOCOLS) },
]

// Display text for any library item (strings or shaped objects).
function itemText(it: unknown): string {
  if (typeof it === 'string') return it
  const o = it as Record<string, unknown>
  if (typeof o.q === 'string') return o.q
  if (typeof o.template === 'string') return o.template
  if (typeof o.pattern === 'string') return o.pattern
  if (typeof o.title === 'string') return o.title as string
  if (typeof o.name === 'string') return o.name as string
  return JSON.stringify(it)
}

const FILLER = [
  'I am disciplined and focused', 'I show up even when it is hard',
  'I keep the promises I make to myself', 'My effort compounds every day',
  'I do the hard thing on purpose', 'I am becoming who I said I would be',
  'Comfort is not my master', 'I finish what I start',
]
function genSentences(n: number): string {
  return Array.from({ length: n }, (_, i) => FILLER[i % FILLER.length]).join('. ') + '.'
}

export default function MindLabClient() {
  const [tab, setTab] = useState<'test' | 'library' | 'builder' | 'speech'>('test')
  const [selected, setSelected] = useState<ModalitySpec | null>(null)
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS)
  const [plan, setPlan] = useState<MindSessionPlan | null>(null)
  const [playLiveState, setPlayLiveState] = useState<MindState | null>(null)
  const [builder, setBuilder] = useState<MoveKind[]>([])

  const ctxFrom = (inp: Inputs): SessionContext => {
    const statement = inp.sentences > 0 ? genSentences(inp.sentences) : (inp.statement.trim() || null)
    return {
      chapter: 5,
      unlockedSystems: [],
      recentState: inp.liveState || null,
      missionAction: statement || 'Send the message you’ve been avoiding.',
      identityStatement: statement,
      dayOfYear: 1,
      seed: inp.seed || inp.poolItem || 0,
      now: Date.now(),
      lastBreathAt: null,
    }
  }

  const makeMove = (spec: ModalitySpec, inp: Inputs): Move => {
    const ctx = ctxFrom(inp)
    if (spec.id === 'regulate') {
      const breath = buildMove('breath', ctx)
      const amp: MoveKind[] = ['win', 'vision', 'choice', 'mirror']
      breath.altPositive = buildMove(amp[(inp.seed || 0) % amp.length], ctx)
      return breath
    }
    const move = buildMove(spec.kind, ctx)
    if (spec.kind === 'breath' && inp.protocol && inp.protocol !== 'auto') move.protocolId = inp.protocol
    return move
  }

  const launch = (spec: ModalitySpec, inp: Inputs) => {
    setPlayLiveState(inp.liveState || null)
    setPlan({ intro: { title: spec.label, subtitle: 'Admin preview' }, moves: [makeMove(spec, inp)], rewardXp: 0 })
  }

  const launchPoolItem = (poolKey: string, index: number) => {
    const spec = MODALITIES.find((m) => m.pool === poolKey)
    if (!spec) return
    const inp = { ...DEFAULT_INPUTS, poolItem: index, seed: index }
    setSelected(spec)
    launch(spec, inp)
  }

  const playSequence = () => {
    if (builder.length === 0) return
    const ctx = ctxFrom(DEFAULT_INPUTS)
    setPlayLiveState(null)
    setPlan({ intro: { title: 'Custom session', subtitle: `${builder.length} moves` }, moves: builder.map((k) => buildMove(k, ctx)), rewardXp: 0 })
  }

  const grouped = useMemo(() => {
    const g: Record<string, ModalitySpec[]> = {}
    for (const m of MODALITIES) (g[m.category] ||= []).push(m)
    return g
  }, [])

  if (plan) {
    return <SessionPlayer plan={plan} preview initialLiveState={playLiveState} onExit={() => setPlan(null)} />
  }

  const poolForSelected = selected?.pool ? POOLS[selected.pool] : undefined

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/dashboard/admin/mind" className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-zinc-900 dark:text-white">
          <FlaskConical className="h-6 w-6 text-violet-500" /> Mind Lab
        </h1>
      </div>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Test any modality and browse all content. Everything runs in <b>preview</b> — no XP, streaks, or logs are written.
      </p>

      {/* Tabs */}
      <div className="mb-5 flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
        {(['test', 'library', 'builder', 'speech'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {t === 'test' ? 'Modalities' : t}
          </button>
        ))}
      </div>

      {/* ── Modalities tab ── */}
      {tab === 'test' && (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, specs]) => (
            <div key={cat}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">{cat}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {specs.map((s) => (
                  <button key={s.id} onClick={() => { setSelected(s); setInputs(DEFAULT_INPUTS) }}
                    className={`rounded-xl border p-3 text-left transition-colors ${selected?.id === s.id ? 'border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-500/10' : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900'}`}>
                    <div className="flex items-center gap-1 text-sm font-semibold text-zinc-900 dark:text-white">
                      {s.label}
                      {s.writes && <span title="writes to DB (suppressed in preview)">⚠️</span>}
                      {s.needsDevice === 'camera' && <span title="needs camera">📷</span>}
                      {s.needsDevice === 'mic' && <span title="needs mic">🎤</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{s.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Inputs panel for the selected modality */}
          {selected && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">{selected.label} — inputs</p>
              <div className="space-y-3">
                {selected.inputs.includes('statement') && (
                  <Field label="Statement (blank = use pool)">
                    <input value={inputs.statement} onChange={(e) => setInputs({ ...inputs, statement: e.target.value })}
                      placeholder="I am disciplined, focused, and consistent." className={inputCls} />
                  </Field>
                )}
                {selected.inputs.includes('sentences') && (
                  <Field label={`Generate N sentences (test reveal speed): ${inputs.sentences || 'off'}`}>
                    <input type="range" min={0} max={8} value={inputs.sentences} onChange={(e) => setInputs({ ...inputs, sentences: Number(e.target.value) })} className="w-full" />
                  </Field>
                )}
                {selected.inputs.includes('protocol') && (
                  <Field label="Breath protocol">
                    <select value={inputs.protocol} onChange={(e) => setInputs({ ...inputs, protocol: e.target.value })} className={inputCls}>
                      {PROTOCOLS.map((p) => <option key={p} value={p}>{p === 'auto' ? 'auto (from state)' : (BREATH_PROTOCOLS[p]?.name ?? p)}</option>)}
                    </select>
                  </Field>
                )}
                {selected.inputs.includes('liveState') && (
                  <Field label="Live state (drives breath-for-state / amplify swap)">
                    <select value={inputs.liveState} onChange={(e) => setInputs({ ...inputs, liveState: e.target.value as MindState | '' })} className={inputCls}>
                      <option value="">none</option>
                      {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                )}
                {selected.inputs.includes('poolItem') && poolForSelected && (
                  <Field label={`Pool item (${poolForSelected.length})`}>
                    <select value={inputs.poolItem} onChange={(e) => setInputs({ ...inputs, poolItem: Number(e.target.value), seed: Number(e.target.value) })} className={inputCls}>
                      {poolForSelected.map((it, i) => <option key={i} value={i}>{i + 1}. {itemText(it).slice(0, 60)}</option>)}
                    </select>
                  </Field>
                )}
                {selected.inputs.includes('seed') && (
                  <Field label={`Seed (rotates content): ${inputs.seed}`}>
                    <input type="range" min={0} max={40} value={inputs.seed} onChange={(e) => setInputs({ ...inputs, seed: Number(e.target.value) })} className="w-full" />
                  </Field>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => launch(selected, inputs)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-500">
                  <Play className="h-4 w-4 fill-current" /> Launch
                </button>
                <button onClick={() => setBuilder((b) => [...b, selected.kind])}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                  <Plus className="h-4 w-4" /> Builder
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Library tab ── */}
      {tab === 'library' && (
        <div className="space-y-5">
          {LIBRARY.map((pool) => (
            <div key={pool.key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">{pool.label} · {pool.items.length}</p>
              <div className="space-y-1.5">
                {pool.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">{i + 1}. {itemText(it)}</span>
                    {POOLS[pool.key] && MODALITIES.some((m) => m.pool === pool.key) && (
                      <button onClick={() => launchPoolItem(pool.key, i)}
                        className="shrink-0 rounded-full bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-500">
                        Test
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Builder tab ── */}
      {tab === 'builder' && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Add moves (from the Modalities tab’s “Builder” button), reorder by removing, then play the sequence.</p>
          <div className="flex flex-wrap gap-2">
            {MODALITIES.filter((m) => m.id !== 'regulate').map((m) => (
              <button key={m.id} onClick={() => setBuilder((b) => [...b, m.kind])}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-violet-400 dark:border-zinc-700 dark:text-zinc-300">
                + {m.label}
              </button>
            ))}
          </div>
          {builder.length > 0 ? (
            <div className="space-y-1.5">
              {builder.map((k, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{i + 1}. {k}</span>
                  <button onClick={() => setBuilder((b) => b.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">No moves yet.</p>
          )}
          {builder.length > 0 && (
            <div className="flex gap-2">
              <button onClick={playSequence} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-500">
                <Play className="h-4 w-4 fill-current" /> Play sequence ({builder.length})
              </button>
              <button onClick={() => setBuilder([])} className="rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">Clear</button>
            </div>
          )}
        </div>
      )}

      {/* ── Speech tab ── */}
      {tab === 'speech' && <SpeechMatchTester />}

      {/* Legend */}
      <div className="mt-8 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">Legend</p>
        <ul className="space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <li><span className="mr-1">⚠️</span> Writes to the DB in a real session (XP / wins / state / discipline) — suppressed here in preview.</li>
          <li><span className="mr-1">📷</span> Requests camera access (Mirror).</li>
          <li><span className="mr-1">🎤</span> Requests microphone access (Say it out loud).</li>
        </ul>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  )
}
