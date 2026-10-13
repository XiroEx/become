'use client'

// Admin → Users → [user] → Streaks.
//
// Shows the member's streaks exactly as they see them, what has been credited,
// and lets an admin honour or repair a streak with an audit trail: credit days
// for a pillar (app was down, coach's call), take credits back, or edit the
// stored day-streak counters. "Grant super streak" is a shortcut that credits
// all three pillars for the last N days — handy for testing what the page
// looks like without inventing food or workouts in the member's real logs.

import { useCallback, useEffect, useState } from 'react'
import { Flame, Dumbbell, UtensilsCrossed, Brain, Sparkles, Loader2, Trash2, Check, X } from 'lucide-react'
import type { StreaksPayload } from '@/lib/streaks/compute'

type Pillar = 'workout' | 'nutrition' | 'mindset'
const PILLARS: { id: Pillar; label: string }[] = [
  { id: 'workout', label: 'Workout' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'mindset', label: 'Mindset' },
]

interface CreditRow {
  id: string
  kind: 'credit' | 'overall'
  pillar: Pillar | null
  dayKey: string
  reason: string
  createdBy: string
  createdAt: string | null
  meta: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null
}

interface Snapshot {
  streaks: StreaksPayload
  credits: CreditRow[]
  overallRaw: { streakDays: number; longestStreak: number; streakFreezes: number; lastActivityDate: string | null; milestonesReached: number[] }
  constants: { minVisible: number; milestones: number[]; maxFreezes: number }
}

function todayKeyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }
}

const inputCls = 'rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-100'
const btnCls = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
const btnGhost = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'

export default function StreakManager({ userId }: { userId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Credit form
  const [pillars, setPillars] = useState<Record<Pillar, boolean>>({ workout: false, nutrition: false, mindset: false })
  const [from, setFrom] = useState(todayKeyLocal())
  const [to, setTo] = useState(todayKeyLocal())
  const [reason, setReason] = useState('')
  // Grant-super shortcut
  const [superDays, setSuperDays] = useState(3)
  // Overall editor
  const [oDays, setODays] = useState<string>('')
  const [oBest, setOBest] = useState<string>('')
  const [oFreezes, setOFreezes] = useState<string>('')
  const [oActive, setOActive] = useState<'keep' | 'today' | 'yesterday'>('keep')
  const [oReason, setOReason] = useState('')

  const tz = new Date().getTimezoneOffset()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/streaks?userId=${userId}&tz=${tz}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Snapshot
      setSnap(data)
      setODays(String(data.overallRaw.streakDays))
      setOBest(String(data.overallRaw.longestStreak))
      setOFreezes(String(data.overallRaw.streakFreezes))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load streaks')
    }
  }, [userId, tz])

  useEffect(() => { void load() }, [load])

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setNotice(null); setError(null)
    try {
      const res = await fetch('/api/admin/streaks', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ userId, tz, ...body }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSnap(data as Snapshot)
      setODays(String((data as Snapshot).overallRaw.streakDays))
      setOBest(String((data as Snapshot).overallRaw.longestStreak))
      setOFreezes(String((data as Snapshot).overallRaw.streakFreezes))
      if (typeof data.credited === 'number') setNotice(`Credited ${data.credited} day${data.credited === 1 ? '' : 's'}.`)
      else if (typeof data.removed === 'number') setNotice(`Removed ${data.removed} credit${data.removed === 1 ? '' : 's'}.`)
      else setNotice('Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const credit = () => {
    const chosen = PILLARS.filter(p => pillars[p.id]).map(p => p.id)
    if (chosen.length === 0) { setError('Pick at least one pillar'); return }
    if (!reason.trim()) { setError('A reason is required'); return }
    void post({ action: 'credit', pillars: chosen, from, to, reason: reason.trim() })
  }
  const uncreditRange = () => {
    const chosen = PILLARS.filter(p => pillars[p.id]).map(p => p.id)
    void post({ action: 'uncredit', pillars: chosen.length ? chosen : undefined, from, to })
  }
  const grantSuper = () => {
    const n = Math.max(1, Math.min(60, Math.round(superDays)))
    void post({ action: 'grant-super', days: n, reason: reason.trim() || `Grant super streak (${n} days)` })
  }
  const removeCredit = (c: CreditRow) => {
    if (!c.pillar) return
    void post({ action: 'uncredit', pillars: [c.pillar], from: c.dayKey, to: c.dayKey })
  }
  const clearAllCredits = () => {
    if (!snap) return
    const days = snap.credits.filter(c => c.kind === 'credit').map(c => c.dayKey).sort()
    if (days.length === 0) return
    void post({ action: 'uncredit', from: days[0], to: days[days.length - 1] })
  }
  const saveOverall = () => {
    if (!oReason.trim()) { setError('A reason is required'); return }
    const body: Record<string, unknown> = { action: 'set-overall', reason: oReason.trim() }
    if (oDays !== '' && Number.isFinite(Number(oDays))) body.streakDays = Number(oDays)
    if (oBest !== '' && Number.isFinite(Number(oBest))) body.longestStreak = Number(oBest)
    if (oFreezes !== '' && Number.isFinite(Number(oFreezes))) body.streakFreezes = Number(oFreezes)
    if (oActive === 'today') body.activeToday = true
    if (oActive === 'yesterday') body.activeToday = false
    void post(body)
  }

  const s = snap?.streaks
  const p = s?.pillars
  const creditsOnly = (snap?.credits ?? []).filter(c => c.kind === 'credit')
  const overallLog = (snap?.credits ?? []).filter(c => c.kind === 'overall')

  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900" data-testid="admin-streaks">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Streaks</h2>
        {snap && <span className="text-[11px] text-zinc-400">shown from {snap.constants.minVisible} · today {s?.todayKey}</span>}
      </div>

      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {notice && <p className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300">{notice}</p>}

      {!snap && !error && (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      )}

      {s && p && (
        <>
          {/* Current numbers — what the member sees */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat icon={<Flame className="h-3.5 w-3.5 text-amber-500" />} label="Day streak" value={`${s.overall.current}d`} sub={`best ${s.overall.best} · ${s.overall.freezes}❄ · ${s.overall.activeToday ? 'active today' : 'not yet today'}`} />
            <Stat icon={<Dumbbell className="h-3.5 w-3.5 text-green-600" />} label="Workout" value={p.workout.target ? `${p.workout.current}w` : '—'} sub={p.workout.target ? `wk ${p.workout.thisWeek}/${p.workout.target}${p.workout.weekLost ? ' · week lost' : ''} · best ${p.workout.best}` : 'no weekly target'} />
            <Stat icon={<UtensilsCrossed className="h-3.5 w-3.5 text-red-500" />} label="Nutrition" value={`${p.nutrition.current}d`} sub={`best ${p.nutrition.best} · ${p.nutrition.activeToday ? 'logged today' : 'not today'}`} />
            <Stat icon={<Brain className="h-3.5 w-3.5 text-purple-500" />} label="Mindset" value={`${p.mindset.current}d`} sub={`best ${p.mindset.best} · ${p.mindset.activeToday ? 'checked in' : 'not today'}`} />
            <Stat icon={<Sparkles className="h-3.5 w-3.5 text-amber-500" />} label="Super" value={`${p.super.current}d`} sub={`food ${p.super.today.nutrition ? '✓' : '·'} mind ${p.super.today.mindset ? '✓' : '·'} train ${p.super.today.trained ? '✓' : '·'}${p.super.today.weekOnTrack ? '' : ' · week off track'}`} />
          </div>

          {/* Credit days */}
          <div className="mb-4 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
            <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">Credit days</p>
            <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Marks each day in the range as counting for the pillar — for outages, or to honour a streak. Credited workout days also count toward that week&apos;s target. Super is derived, so credit all three.
            </p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {PILLARS.map(pl => (
                <label key={pl.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${pillars[pl.id] ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black' : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}>
                  <input type="checkbox" className="sr-only" checked={pillars[pl.id]} onChange={e => setPillars(v => ({ ...v, [pl.id]: e.target.checked }))} />
                  {pl.label}
                </label>
              ))}
              <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className={inputCls} aria-label="From" />
              <span className="text-xs text-zinc-400">→</span>
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={inputCls} aria-label="To" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required) — e.g. app outage Aug 14–15" className={`${inputCls} min-w-[220px] flex-1`} />
              <button type="button" onClick={credit} disabled={busy} className={btnCls} data-testid="admin-streak-credit"><Check className="h-3.5 w-3.5" /> Credit</button>
              <button type="button" onClick={uncreditRange} disabled={busy} className={btnGhost}><X className="h-3.5 w-3.5" /> Uncredit range</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-zinc-100 pt-2 dark:border-zinc-800">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Shortcut:</span>
              <button type="button" onClick={grantSuper} disabled={busy} className={btnGhost} data-testid="admin-streak-grant-super"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Grant super streak</button>
              <input type="number" min={1} max={60} value={superDays} onChange={e => setSuperDays(Number(e.target.value))} className={`${inputCls} w-16`} aria-label="Days" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">days ending today (credits all three pillars, and workout back to that week&apos;s Sunday so the weeks stay on target)</span>
            </div>
          </div>

          {/* Overall day streak editor */}
          <div className="mb-4 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
            <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">Day streak counters</p>
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Current<br /><input type="number" min={0} value={oDays} onChange={e => setODays(e.target.value)} className={`${inputCls} w-20`} /></label>
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Best<br /><input type="number" min={0} value={oBest} onChange={e => setOBest(e.target.value)} className={`${inputCls} w-20`} /></label>
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Freezes<br /><input type="number" min={0} max={snap.constants.maxFreezes} value={oFreezes} onChange={e => setOFreezes(e.target.value)} className={`${inputCls} w-20`} /></label>
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Last activity<br />
                <select value={oActive} onChange={e => setOActive(e.target.value as 'keep' | 'today' | 'yesterday')} className={inputCls}>
                  <option value="keep">keep ({snap.overallRaw.lastActivityDate ? snap.overallRaw.lastActivityDate.slice(0, 10) : 'none'})</option>
                  <option value="today">mark active today</option>
                  <option value="yesterday">alive, not yet today</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={oReason} onChange={e => setOReason(e.target.value)} placeholder="Reason (required)" className={`${inputCls} min-w-[220px] flex-1`} />
              <button type="button" onClick={saveOverall} disabled={busy} className={btnCls} data-testid="admin-streak-save-overall"><Check className="h-3.5 w-3.5" /> Save counters</button>
            </div>
          </div>

          {/* Credits list */}
          <div className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Credits ({creditsOnly.length})</p>
              {creditsOnly.length > 0 && (
                <button type="button" onClick={clearAllCredits} disabled={busy} className="text-[11px] text-red-600 hover:underline dark:text-red-400">Remove all</button>
              )}
            </div>
            {creditsOnly.length === 0 ? (
              <p className="text-xs text-zinc-400">None. Everything shown is from the member&apos;s real activity.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {creditsOnly.map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1 text-xs dark:bg-zinc-800/60">
                    <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">
                      <span className="font-mono">{c.dayKey}</span> · <span className="capitalize">{c.pillar}</span>
                      <span className="text-zinc-400"> — {c.reason || 'no reason'} · {c.createdBy}</span>
                    </span>
                    <button type="button" onClick={() => removeCredit(c)} disabled={busy} aria-label="Remove credit" className="shrink-0 rounded p-1 text-zinc-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            {overallLog.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-zinc-500">Counter edits ({overallLog.length})</summary>
                <ul className="mt-1 space-y-1">
                  {overallLog.slice(0, 20).map(c => (
                    <li key={c.id} className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-mono">{c.dayKey}</span> {c.createdBy}: {c.reason} —
                      {' '}{JSON.stringify(c.meta?.before ?? {})} → {JSON.stringify(c.meta?.after ?? {})}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">{icon}{label}</div>
      <div className="text-lg font-bold leading-tight text-zinc-900 dark:text-white">{value}</div>
      <div className="truncate text-[10px] text-zinc-400" title={sub}>{sub}</div>
    </div>
  )
}
