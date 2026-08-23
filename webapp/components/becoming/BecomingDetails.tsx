'use client'

// The Becoming — details. A full-screen reading view over the stage, in the
// stage's own language: dark sky, glass cards, the pillar hues. Four screens
// you swipe or tab between:
//
//   Mind      score, identity, chapter then → now → next, the arc, how you've shown up
//   Fuel      the weight plan then → now → next, pace, adherence, what's next
//   Training  days/week then → now → next, lifts then → now → target, what's next
//   Story     week by week — every headline the app has written about you, the
//             wins you banked, the records you set; tap a week to fly to it
//
// Data: the same APIs the old page used (mind progress / wins / state /
// session, goals + progress) plus the journey weeks handed in by the stage.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Brain, UtensilsCrossed, Dumbbell, BookOpen, Trophy, Sparkles, Lock, ArrowRight, TrendingUp, Check, Minus, Flame, HelpCircle, Info } from 'lucide-react'
import { CHAPTERS, SYSTEM_INFO, getXpToNextChapter } from '@/lib/mindXP'
import type { MindState } from '@/lib/mindContent'
import type { GoalProgress } from '@/lib/goals/progress'
import type { WeekSnapshot } from '@/lib/becoming/weeks'
import { fmtUnit } from '@/lib/goals/pace'
import { PILLAR as SUBJECT, pillarColor as weekColor, STREAK_INK } from '@/lib/pillarColors'
import WeightChart from '@/components/becoming/WeightChart'
import StrengthTargetSheet from '@/components/becoming/StrengthTargetSheet'
import { EST_MAX_LABEL, EST_MAX_LABEL_SHORT } from '@/lib/strength/language'
import { formatVolume, formatWorkTime } from '@/lib/becoming/weekTraining'


type Tab = 'mind' | 'fuel' | 'training' | 'story'

/** The two halves of Training: this week's work, and long-run strength. */
type TrainView = 'week' | 'strength'

/**
 * What the explainer sheet is currently explaining. `kind: 'metric'` is the
 * bare "what is an estimated max" definition; `kind: 'target'` justifies one
 * lift's number.
 */
type SheetState =
  | { kind: 'metric' }
  | { kind: 'target'; slug: string; name: string; current: number; target: number; reached: boolean }
const TABS: Array<{ id: Tab; label: string; Icon: typeof Brain; hue: string }> = [
  { id: 'mind', label: 'Mind', Icon: Brain, hue: SUBJECT.mind.hex },
  { id: 'fuel', label: 'Fuel', Icon: UtensilsCrossed, hue: SUBJECT.fuel.hex },
  { id: 'training', label: 'Training', Icon: Dumbbell, hue: SUBJECT.training.hex },
  { id: 'story', label: 'Story', Icon: BookOpen, hue: '#a78bfa' },
]

interface ProgressData { chapter: number; xp: number; xpBank: number; vision: { identityStatement?: string } | null; chapterHistory: { chapter: number; unlockedAt: string }[] }
interface Win { _id?: string; win: string; date: string }
interface StateLogEntry { state: MindState; timestamp: string }
interface ProgramLite { name: string; completedWorkouts?: number; totalWorkouts?: number; currentWeek: number; totalWeeks: number; programId: string }
interface ProgressLite { currentProgram: ProgramLite | null }

const STATE_META: Record<MindState, { label: string; dot: string }> = {
  locked_in:  { label: 'Locked in',  dot: '#34d399' },
  low_energy: { label: 'Low energy', dot: '#60a5fa' },
  distracted: { label: 'Distracted', dot: '#fbbf24' },
  stressed:   { label: 'Stressed',   dot: '#f87171' },
}
const FOCUS_BY_STATE: Record<MindState, { title: string; sub: string }> = {
  stressed:   { title: 'Calm the storm', sub: 'Stress keeps showing up — lean on state-shift + breath.' },
  distracted: { title: 'Cut the noise',  sub: 'Distraction is the pattern — practice focus + one-thing.' },
  low_energy: { title: 'Do it anyway',   sub: 'Low energy lately — discipline reps move you regardless.' },
  locked_in:  { title: 'Keep stacking',  sub: 'You’re locked in — bank the momentum and protect the streak.' },
}

function authHeaders(): HeadersInit { return { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` } }
function fmtDate(d: string | number | Date | null | undefined): string { return d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—' }
// Weigh-ins are stored as UTC-midnight DAY MARKERS, not instants: read one in
// local time west of UTC and it slides to the day before. Format those in UTC
// so this card and the chart above it name the same day.
function fmtDayMarker(d: string | number | Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—'
}
function relDay(d: string | number | Date): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 7) return `${days}d ago`
  return fmtDate(d)
}

/* ── glass primitives ─────────────────────────────────────────────────── */
function Glass({ children, className = '', hue, ...rest }: { children: React.ReactNode; className?: string; hue?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 ${className}`} {...rest}>
      {hue && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl" style={{ background: hue, opacity: 0.18 }} />}
      <div className="relative">{children}</div>
    </div>
  )
}
function Eyebrow({ children }: { children: React.ReactNode }) { return <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">{children}</p> }
function Cell({ label, value, sub, hue }: { label: string; value: string; sub?: string; hue?: string }) {
  // Pillar colours identify the pillar; they are not status. Tint them up so a
  // red "now" weight reads as nutrition, not as an error.
  return (
    <div className="rounded-xl bg-white/[0.06] p-2.5 text-center ring-1 ring-white/5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-white/45">{label}</p>
      <p className="mt-1 truncate text-sm font-bold" style={{ color: hue ? `color-mix(in srgb, ${hue} 62%, white)` : 'white' }}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-white/55">{sub}</p>}
    </div>
  )
}
/**
 * Segmented control for splitting a pillar screen into two readings of the
 * same subject. Training uses it for "this week" vs "strength" — near view and
 * long arc, which are different numbers and were previously crammed into one
 * scroll where the long arc won and nobody could find the week.
 */
function SubSwitch<T extends string>({ value, onChange, options, hue }: {
  value: T
  onChange: (v: T) => void
  options: Array<{ id: T; label: string }>
  hue: string
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-white/[0.06] p-1 ring-1 ring-white/10" role="tablist" data-testid="training-subswitch">
      {options.map(o => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            data-testid={`training-subswitch-${o.id}`}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'text-white' : 'text-white/50 hover:text-white/75'}`}
            style={active ? { background: `color-mix(in srgb, ${hue} 26%, transparent)` } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
function Next({ title, sub, url, hue, onClose }: { title: string; sub: string; url: string; hue: string; onClose: () => void }) {
  return (
    <Link href={url} onClick={onClose} className="mt-3 flex items-start gap-2.5 rounded-2xl p-3 ring-1 ring-white/10 transition-colors hover:bg-white/[0.06]" style={{ background: `linear-gradient(120deg, ${hue}22, transparent 70%)` }}>
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hue }} />
      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">{title}</p><p className="text-xs text-white/60">{sub}</p></div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/40" />
    </Link>
  )
}

export interface BecomingDetailsProps {
  weeks?: WeekSnapshot[]
  /** Every weigh-in by local day, for the weight chart. */
  weighIns?: Array<{ day: string; value: number }>
  todayKey?: string
  unit?: 'lbs' | 'kg'
  onClose: () => void
  /** Fly the stage to a week (index) — from the Story screen. */
  onJumpToWeek?: (index: number) => void
  initialTab?: Tab
}

export default function BecomingDetails({ weeks = [], weighIns = [], todayKey = '', unit = 'lbs', onClose, onJumpToWeek, initialTab = 'mind' }: BecomingDetailsProps) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [dir, setDir] = useState(1)
  const [prog, setProg] = useState<ProgressData | null>(null)
  const [wins, setWins] = useState<Win[]>([])
  const [logs, setLogs] = useState<StateLogEntry[]>([])
  const [streak, setStreak] = useState(0)
  const [goals, setGoals] = useState<GoalProgress | null>(null)
  const [program, setProgram] = useState<ProgramLite | null>(null)
  const [settingLifts, setSettingLifts] = useState(false)
  // Training splits into two questions that want different numbers: "did this
  // week count" (sessions, sets, load moved) and "am I getting stronger"
  // (estimated maxes and targets). The week is what someone opens the app to
  // check, so it leads.
  const [trainView, setTrainView] = useState<TrainView>('week')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const tz = new Date().getTimezoneOffset()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const h = authHeaders()
        const [pRes, wRes, sRes, sessRes, gRes, prRes] = await Promise.all([
          fetch('/api/mind/progress', { headers: h }), fetch('/api/mind/wins?limit=60', { headers: h }),
          fetch('/api/mind/state?limit=60', { headers: h }), fetch(`/api/mind/session?tz=${tz}`, { headers: h }),
          fetch(`/api/goals?tz=${tz}`, { headers: h }), fetch(`/api/progress?tz=${tz}`, { headers: h }),
        ])
        if (cancelled) return
        if (pRes.ok) setProg(await pRes.json())
        if (wRes.ok) setWins((await wRes.json()).wins ?? [])
        if (sRes.ok) setLogs((await sRes.json()).logs ?? [])
        if (sessRes.ok) setStreak((await sessRes.json()).streak ?? 0)
        if (gRes.ok) setGoals(await gRes.json())
        if (prRes.ok) setProgram(((await prRes.json()) as ProgressLite).currentProgram ?? null)
      } catch { /* screens show what they have */ }
    })()
    return () => { cancelled = true }
  }, [tz])

  const go = (t: Tab) => { const a = TABS.findIndex(x => x.id === tab), b = TABS.findIndex(x => x.id === t); setDir(b >= a ? 1 : -1); setTab(t) }
  const step = (d: 1 | -1) => { const i = TABS.findIndex(x => x.id === tab); const n = TABS[Math.max(0, Math.min(TABS.length - 1, i + d))]; if (n.id !== tab) go(n.id) }

  // Swipe between screens.
  const drag = useRef<{ x: number; y: number; t: number } | null>(null)
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, t: performance.now() } }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1) }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── Mind derivations ───────────────────────────────────────────────────
  const chapter = prog?.chapter ?? 1
  const score = prog?.xpBank ?? 0
  const identity = prog?.vision?.identityStatement?.trim() || null
  const xpProgress = useMemo(() => getXpToNextChapter(chapter, prog?.xp ?? 0), [chapter, prog?.xp])
  const sinceDate = useMemo(() => {
    const c: number[] = []
    if (logs.length) c.push(new Date(logs[logs.length - 1].timestamp).getTime())
    const first = prog?.chapterHistory?.[0]?.unlockedAt; if (first) c.push(new Date(first).getTime())
    if (wins.length) c.push(new Date(wins[wins.length - 1].date).getTime())
    if (weeks.length) c.push(new Date(weeks[0].weekKey + 'T12:00:00Z').getTime())
    return c.length ? Math.min(...c) : null
  }, [logs, wins, prog, weeks])
  const recentStates = useMemo(() => logs.slice(0, 14).reverse(), [logs])
  const dominantState = useMemo<MindState | null>(() => {
    if (!logs.length) return null
    const counts: Record<string, number> = {}
    for (const l of logs.slice(0, 14)) counts[l.state] = (counts[l.state] ?? 0) + 1
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as MindState) ?? null
  }, [logs])
  const lockedInPct = useMemo(() => { const r = logs.slice(0, 14); return r.length ? Math.round((r.filter(l => l.state === 'locked_in').length / r.length) * 100) : null }, [logs])
  const currentCh = CHAPTERS[chapter - 1]
  const nextCh = chapter < 5 ? CHAPTERS[chapter] : null
  const focus = dominantState ? FOCUS_BY_STATE[dominantState] : null

  // ── Pillars ────────────────────────────────────────────────────────────
  const n = goals?.nutrition, t = goals?.training
  const tWeek = t?.week ?? null
  // The load unit the training numbers are in. Falls back to the prop, which
  // is the same profile value, so this is only ever a timing difference while
  // /api/goals is still in flight.
  const tUnit: 'lbs' | 'kg' = t?.unit ?? (unit === 'kg' ? 'kg' : 'lbs')
  const sheetExplanation = sheet?.kind === 'target' ? t?.liftRationales?.[sheet.slug] ?? null : null
  const progPct = program && program.totalWorkouts && program.completedWorkouts != null ? Math.round((program.completedWorkouts / program.totalWorkouts) * 100) : program ? Math.round((program.currentWeek / (program.totalWeeks || 1)) * 100) : null
  const setSuggestedLifts = async () => {
    setSettingLifts(true)
    try {
      const res = await fetch('/api/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ pillar: 'training', lifts: 'suggested', tz }) })
      if (res.ok) setGoals(await res.json())
    } finally { setSettingLifts(false) }
  }

  // ── Story derivations ──────────────────────────────────────────────────
  const prTimeline = useMemo(() => weeks.flatMap(w => w.training.prs.map(p => ({ ...p, week: w }))).reverse().slice(0, 12), [weeks])
  const weeksDesc = useMemo(() => [...weeks].reverse(), [weeks])
  const hue = TABS.find(x => x.id === tab)!.hue

  return (
    <motion.div
      key="details"
      role="dialog" aria-modal="true" aria-label="Becoming details"
      data-testid="becoming-details"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="dark fixed inset-0 z-[95] flex flex-col bg-[#07060d] text-white"
    >
      {/* Sky, tinted by the active screen */}
      <div className="pointer-events-none absolute inset-0 transition-[background] duration-500" style={{ background: `radial-gradient(120% 55% at 50% -10%, ${hue}2e, transparent 62%), radial-gradient(80% 60% at 90% 110%, rgba(255,255,255,0.05), transparent 60%)` }} />

      {/* Header + tabs */}
      <div className="relative shrink-0 px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">The Becoming</p>
            <p className="text-sm font-bold">Details</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10" role="tablist" aria-label="Details screens">
          {TABS.map(tb => {
            const on = tb.id === tab
            return (
              <button
                key={tb.id} role="tab" aria-selected={on} data-testid={`details-tab-${tb.id}`}
                onClick={() => go(tb.id)}
                className={`relative flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors ${on ? 'text-white' : 'text-white/55 hover:text-white/80'}`}
              >
                {on && <motion.span layoutId="details-tab" className="absolute inset-0 rounded-xl bg-white/12 ring-1 ring-white/15" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                <tb.Icon className="relative h-4 w-4" style={{ color: on ? tb.hue : undefined }} />
                <span className="relative">{tb.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Screens */}
      <div className="relative min-h-0 flex-1 overflow-hidden" onPointerDown={onDown} onPointerUp={onUp}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={tab}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 40 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-3"
            data-testid={`details-screen-${tab}`}
          >
            <div className="mx-auto max-w-2xl space-y-3">
              {tab === 'mind' && (
                <>
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-violet-500 p-5 shadow-[0_24px_60px_-24px_rgba(124,58,237,0.7)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70"><Trophy className="h-3.5 w-3.5" /> Becoming score</p>
                        <p className="mt-1 text-5xl font-black tabular-nums tracking-tight">{score.toLocaleString()}</p>
                      </div>
                      {streak > 0 && (
                        <div className="flex flex-col items-center rounded-2xl bg-white/15 px-4 py-2">
                          <Flame className="h-5 w-5" style={{ color: STREAK_INK.day.hex }} />
                          <span className="mt-0.5 text-lg font-bold tabular-nums">{streak}</span>
                          <span className="text-[10px] uppercase tracking-wide text-white/70">day streak</span>
                        </div>
                      )}
                    </div>
                    {identity && <p className="mt-4 font-serif text-[15px] italic leading-snug text-white/90">“{identity}”</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Cell label="Then" value={sinceDate ? fmtDate(sinceDate) : '—'} sub="where you started" />
                    <Cell label="Now" value={`Ch ${chapter} · ${currentCh?.name}`} sub={currentCh?.theme} hue={SUBJECT.mind.hex} />
                    <Cell label="Next" value={nextCh ? nextCh.name : 'Architect+'} sub={nextCh ? nextCh.theme : 'keep building'} />
                  </div>
                  <Glass hue={SUBJECT.mind.hex}>
                    <Eyebrow>The arc</Eyebrow>
                    <div className="space-y-1.5">
                      {CHAPTERS.map(c => {
                        const done = c.id < chapter, active = c.id === chapter, locked = c.id > chapter
                        return (
                          <div key={c.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-white/[0.08] ring-1 ring-white/15' : ''}`}>
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: done ? '#34d399' : active ? SUBJECT.mind.hex : 'rgba(255,255,255,0.08)', color: done || active ? '#0b0a12' : 'rgba(255,255,255,0.4)' }}>
                              {locked ? <Lock className="h-3.5 w-3.5" /> : c.id}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-semibold ${locked ? 'text-white/40' : 'text-white'}`}>{c.name}</p>
                              <p className="truncate text-xs text-white/50">{c.theme}</p>
                            </div>
                            {active && xpProgress && <span className="shrink-0 text-xs font-semibold text-white/50">{xpProgress.pct}%</span>}
                            {done && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                          </div>
                        )
                      })}
                    </div>
                  </Glass>
                  {recentStates.length > 0 && (
                    <Glass>
                      <div className="mb-2 flex items-center justify-between"><Eyebrow>How you’ve shown up</Eyebrow>{lockedInPct !== null && <span className="text-xs font-semibold text-emerald-400">{lockedInPct}% locked in</span>}</div>
                      <div className="flex flex-wrap gap-1.5">{recentStates.map((l, i) => <span key={i} title={`${STATE_META[l.state].label} · ${relDay(l.timestamp)}`} className="h-3 w-3 rounded-full" style={{ background: STATE_META[l.state].dot }} />)}</div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{(Object.keys(STATE_META) as MindState[]).map(s => <span key={s} className="flex items-center gap-1.5 text-[11px] text-white/55"><span className="h-2 w-2 rounded-full" style={{ background: STATE_META[s].dot }} /> {STATE_META[s].label}</span>)}</div>
                    </Glass>
                  )}
                  {focus && <Next title={focus.title} sub={focus.sub} url="/dashboard/mind" hue={SUBJECT.mind.hex} onClose={onClose} />}
                  {nextCh && (
                    <Link href="/dashboard/mind" onClick={onClose} className="flex items-center justify-between rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 hover:bg-white/[0.09]">
                      <div className="min-w-0"><p className="text-sm font-semibold">Next: {nextCh.name}</p><p className="truncate text-xs text-white/55">Unlocks {nextCh.systems.map(s => SYSTEM_INFO[s]?.label ?? s).join(', ')}</p></div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-white/40" />
                    </Link>
                  )}
                </>
              )}

              {tab === 'fuel' && (
                <>
                  {/* The line first: where you have been is the story; the plan
                      is the commentary. */}
                  {weighIns.length > 0 && (
                    <Glass hue={SUBJECT.fuel.hex}>
                      <WeightChart weighIns={weighIns} target={n?.target.weight ?? null} unit={unit} todayKey={todayKey} direction={n?.direction ?? null} />
                    </Glass>
                  )}
                  <Glass hue={SUBJECT.fuel.hex} data-testid="weight-plan">
                    <div className="mb-2 flex items-center justify-between">
                      <Eyebrow>Weight plan</Eyebrow>
                      {n?.pace && n.status === 'active' && n.pace.status !== 'done' && <span className={`text-xs font-semibold ${n.pace.status === 'behind' ? 'text-amber-300' : 'text-emerald-400'}`}>{n.pace.status === 'behind' ? `${fmtUnit(n.pace.behindByKg, unit)} behind pace` : n.pace.status === 'ahead' ? `${fmtUnit(n.pace.aheadByKg, unit)} ahead` : n.pace.status === 'on' ? 'On pace' : ''}</span>}
                      {(n?.status === 'achieved' || n?.pace?.status === 'done') && <span className="text-xs font-semibold text-emerald-400">Reached ✓</span>}
                    </div>
                    {!goals ? <div className="h-16 animate-pulse rounded-xl bg-white/[0.06]" /> : n && n.target.weight ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <Cell label="Then" value={n.baseline.weight != null ? `${Math.round(n.baseline.weight)} ${unit}` : '—'} sub={n.baseline.date ? `plan from ${fmtDate(n.baseline.date)}` : undefined} />
                          <Cell label="Now" value={n.now.weight != null ? `${Math.round(n.now.weight)} ${unit}` : '—'} sub={n.now.fourWeeksAgo != null && n.now.weight != null ? `${n.now.weight - n.now.fourWeeksAgo <= -0.05 ? '↓' : n.now.weight - n.now.fourWeeksAgo >= 0.05 ? '↑' : '→'} ${Math.abs(n.now.weight - n.now.fourWeeksAgo).toFixed(1)} in 4 wks` : n.now.date ? fmtDayMarker(n.now.date) : undefined} hue={SUBJECT.fuel.hex} />
                          <Cell label="Next" value={`${Math.round(n.target.weight)} ${unit}`} sub={n.pace?.etaDate ? `${n.pace.eta} → ${fmtDate(n.pace.etaDate)}` : n.direction === 'maintain' ? 'hold ±2' : n.target.pacePerWeek ? `${n.target.pacePerWeek} ${unit}/wk` : undefined} />
                        </div>
                        {n.journeyStart.weight != null && n.journeyStart.date && n.baseline.date && new Date(n.journeyStart.date) < new Date(n.baseline.date) && <p className="mt-2 text-[11px] text-white/45">First weigh-in {Math.round(n.journeyStart.weight)} {unit} on {fmtDayMarker(n.journeyStart.date)}.</p>}
                        {n.adherence && (
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span className={`inline-flex items-center gap-1 ${n.adherence.logOk ? 'text-emerald-400' : 'text-white/60'}`}>{n.adherence.logOk ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}Logged {n.adherence.logDays}/{n.adherence.totalDays} days <span className="text-white/40">(aim {n.adherence.logTarget})</span></span>
                            {n.adherence.proteinJudged && <span className={`inline-flex items-center gap-1 ${n.adherence.proteinOk ? 'text-emerald-400' : 'text-white/60'}`}>{n.adherence.proteinOk ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}Protein hit {n.adherence.proteinDays}/{n.adherence.totalDays} <span className="text-white/40">(aim {n.adherence.proteinTarget}{n.proteinGoal ? ` · ${n.proteinGoal}g` : ''})</span></span>}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-white/60">No target weight yet — set one in <Link href="/dashboard/settings" onClick={onClose} className="font-medium text-amber-300">Settings</Link> and this becomes then → now → next.</p>
                    )}
                  </Glass>
                  {n && <Next title={n.suggestion.title} sub={n.suggestion.sub} url={n.suggestion.url} hue={SUBJECT.fuel.hex} onClose={onClose} />}
                  <Link href="/dashboard/nutrition/goals" onClick={onClose} className="flex items-center justify-between rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 hover:bg-white/[0.09]"><span className="text-sm font-semibold">Pace, targets and macros</span><ArrowRight className="h-5 w-5 text-white/40" /></Link>
                </>
              )}

              {tab === 'training' && (
                <>
                  <SubSwitch
                    value={trainView}
                    onChange={setTrainView}
                    hue={SUBJECT.training.hex}
                    options={[
                      { id: 'week', label: 'This week' },
                      { id: 'strength', label: 'Strength' },
                    ]}
                  />

                  {trainView === 'week' ? (
                  <>
                    <Glass hue={SUBJECT.training.hex}>
                      <div className="mb-2 flex items-center justify-between">
                        <Eyebrow>The week</Eyebrow>
                        {t?.target.daysPerWeek && <span className={`text-xs font-semibold ${t.thisWeek.weekLost ? 'text-amber-300' : 'text-emerald-400'}`}>This week {t.thisWeek.done}/{t.target.daysPerWeek}{t.thisWeek.weekLost ? ' · off track' : t.thisWeek.remaining === 0 ? ' · done' : ''}</span>}
                      </div>
                      {!goals ? <div className="h-16 animate-pulse rounded-xl bg-white/[0.06]" /> : t && t.target.daysPerWeek ? (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <Cell label="Then" value={t.baseline.prs.length ? `${t.baseline.prs.length} lifts` : t.startedAt ? fmtDate(t.startedAt) : '—'} sub={t.baseline.date ? `PRs on ${fmtDate(t.baseline.date)}` : 'baseline'} />
                            <Cell label="Now" value={t.avgLast4 != null ? `${t.avgLast4}/wk` : '—'} sub="avg, last 4 weeks" hue={SUBJECT.training.hex} />
                            <Cell label="Next" value={`${t.target.daysPerWeek}/wk`} sub={program && progPct != null ? `${program.name} · ${progPct}%` : 'your target'} />
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-white/60">Set how many days a week you train in <Link href="/dashboard/settings" onClick={onClose} className="font-medium text-orange-300">Settings</Link> — the week, the streak and this screen are measured against it.</p>
                      )}
                    </Glass>

                    {/* What actually got moved this week. These numbers change
                        every session, unlike an estimated max, which can sit
                        still for weeks while real work is happening. */}
                    {tWeek && tWeek.sessions > 0 && (
                      <Glass hue={SUBJECT.training.hex}>
                        <Eyebrow>What you moved</Eyebrow>
                        <div className="grid grid-cols-3 gap-2">
                          <Cell label="Sessions" value={String(tWeek.sessions)} sub={tWeek.exercises ? `${tWeek.exercises} exercise${tWeek.exercises === 1 ? '' : 's'}` : undefined} hue={SUBJECT.training.hex} />
                          <Cell label="Sets" value={String(tWeek.sets)} sub={tWeek.reps ? `${tWeek.reps.toLocaleString()} reps` : undefined} />
                          <Cell
                            label="Load moved"
                            value={tWeek.hasWeightedWork ? formatVolume(tWeek.volume, tUnit) : formatWorkTime(tWeek.workSeconds)}
                            sub={tWeek.hasWeightedWork ? 'weight × reps' : 'time under load'}
                          />
                        </div>
                        {tWeek.topSet && (
                          <p className="mt-2.5 text-[11px] text-white/50">
                            Best set: <span className="text-white/80">{tWeek.topSet.name}</span> {tWeek.topSet.weight} {tUnit} × {tWeek.topSet.reps}
                          </p>
                        )}
                      </Glass>
                    )}
                    {t && <Next title={t.suggestion.title} sub={t.suggestion.sub} url={t.suggestion.url} hue={SUBJECT.training.hex} onClose={onClose} />}
                  </>
                ) : (
                  <>
                    <Glass hue={SUBJECT.training.hex}>
                      <div className="mb-2 flex items-center justify-between">
                        <Eyebrow>Your lifts</Eyebrow>
                        <button type="button" onClick={() => setSheet({ kind: 'metric' })} data-testid="details-what-is-est-max" className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/15">
                          <HelpCircle className="h-3 w-3" /> {EST_MAX_LABEL_SHORT}?
                        </button>
                      </div>
                      {!goals ? <div className="h-16 animate-pulse rounded-xl bg-white/[0.06]" /> : t && t.lifts.length > 0 ? (
                        <>
                          <div className="space-y-1">
                            {t.lifts.slice(0, 5).map(l => {
                              const hasTarget = l.target != null
                              // Only a target is worth tapping — without one
                              // there is nothing to justify.
                              const Row = hasTarget ? 'button' : 'div'
                              return (
                                <Row
                                  key={l.slug}
                                  {...(hasTarget
                                    ? {
                                        type: 'button' as const,
                                        onClick: () => setSheet({ kind: 'target', slug: l.slug, name: l.name, current: l.now, target: l.target as number, reached: !!l.reached }),
                                        'data-testid': 'details-lift-target',
                                      }
                                    : {})}
                                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs ${hasTarget ? 'hover:bg-white/[0.06]' : ''}`}
                                >
                                  <span className="min-w-0 truncate text-white/80">{l.name}</span>
                                  <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-white/55">
                                    <span>
                                      {l.then} → <span className="font-semibold text-white">{l.now}</span>
                                      {hasTarget && (
                                        l.reached
                                          ? <span className="ml-1.5 text-emerald-400">reached ✓</span>
                                          : <> → <span style={{ color: SUBJECT.training.hex }}>{l.target}</span></>
                                      )}
                                      {l.delta !== 0 && <span className={`ml-1.5 ${l.delta > 0 ? 'text-emerald-400' : 'text-white/40'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</span>}
                                    </span>
                                    {hasTarget && <Info className="h-3 w-3 shrink-0 text-white/30" />}
                                  </span>
                                </Row>
                              )
                            })}
                          </div>
                          <p className="mt-2 text-[10px] text-white/40">
                            {EST_MAX_LABEL}, in {tUnit} — where you started → where you are{t.hasLiftTargets ? ' → what you are working toward' : ''}.
                            {t.hasLiftTargets ? ' Tap a lift to see why that target.' : ''}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-white/60">Log a few weighted sets and your lifts show up here, with an {EST_MAX_LABEL.toLowerCase()} for each.</p>
                      )}
                      {t && !t.hasLiftTargets && t.suggestedLifts.length > 0 && (
                        <button type="button" onClick={setSuggestedLifts} disabled={settingLifts} data-testid="details-set-lifts" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50">
                          <TrendingUp className="h-3.5 w-3.5" /> Set targets for {t.suggestedLifts.map(s => s.name).join(', ')}
                        </button>
                      )}
                    </Glass>
                    {prTimeline.length > 0 && (
                      <Glass hue="#ffd37a">
                        <Eyebrow>Records</Eyebrow>
                        <div className="space-y-1.5">
                          {prTimeline.slice(0, 6).map((p, i) => (
                            <button key={i} type="button" onClick={() => onJumpToWeek?.(p.week.index)} className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-xs hover:bg-white/[0.06]">
                              <span className="flex min-w-0 items-center gap-1.5 text-white/85"><Trophy className="h-3.5 w-3.5 shrink-0 text-amber-300" /><span className="truncate">{p.name}</span></span>
                              <span className="shrink-0 tabular-nums text-white/55">{p.e1RM} <span className="text-white/40">{tUnit} · {p.week.label}</span></span>
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[10px] text-white/40">Best {EST_MAX_LABEL.toLowerCase()} for each lift, and the week you hit it.</p>
                      </Glass>
                    )}
                  </>
                  )}
                </>
              )}

              {tab === 'story' && (
                <>
                  <Glass hue="#a78bfa">
                    <Eyebrow>Evidence wall</Eyebrow>
                    {wins.length === 0 ? (
                      <p className="text-sm text-white/60">No wins banked yet. Bank one in a session — the proof that you’re changing builds here.</p>
                    ) : (
                      <div className="space-y-2">
                        {wins.slice(0, 20).map((w, i) => (
                          <motion.div key={w._id ?? i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="flex items-start gap-2.5">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300" />
                            <div className="min-w-0 flex-1"><p className="font-serif text-[14px] italic leading-snug text-white/90">“{w.win}”</p><p className="mt-0.5 text-[11px] text-white/45">{relDay(w.date)}</p></div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </Glass>
                  {weeksDesc.length > 0 && (
                    <Glass>
                      <Eyebrow>Week by week</Eyebrow>
                      <div className="space-y-1">
                        {weeksDesc.map(w => (
                          <button key={w.weekKey} type="button" onClick={() => onJumpToWeek?.(w.index)} data-testid="details-week-row" className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.06]">
                            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: weekColor(w.subject, w.score, 60) }} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{w.headline}</p>
                              <p className="truncate text-[11px] text-white/50">{w.isCurrent ? 'this week' : w.gap ? `${w.label} · away ${w.gap.weeks} wks` : w.label}{w.tags.length ? ` · ${w.tags.slice(0, 3).join(' · ')}` : ''}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-white/30" />
                          </button>
                        ))}
                      </div>
                    </Glass>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+6px)] text-center text-[10px] text-white/35">swipe between screens</p>

      <StrengthTargetSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        hue={SUBJECT.training.hex}
        unit={tUnit}
        liftName={sheet?.kind === 'target' ? sheet.name : undefined}
        current={sheet?.kind === 'target' ? sheet.current : undefined}
        target={sheet?.kind === 'target' ? sheet.target : undefined}
        reached={sheet?.kind === 'target' ? sheet.reached : undefined}
        explanation={sheetExplanation}
      />
    </motion.div>
  )
}
