'use client'

// Streaks — one page for every streak the member is running.
//
// The dashboard's flame tile shows ONE number (any activity, any pillar). This
// page breaks it out: workouts by the week, nutrition and mindset by the day,
// and a "super" streak for days when all three happened. Nothing is called a
// streak until it is three long — the tiles say "Building" until then.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Flame, Dumbbell, UtensilsCrossed, Brain, Snowflake, Check, Circle, Loader2 } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card } from '@/components/ui'
import FireNumber from '@/components/streaks/FireNumber'
import { streakDisplay, STREAK_VISIBLE_MIN } from '@/lib/streaks/pillars'
import { readCache, writeCache } from '@/lib/clientCache'

interface DayPillar { unit: 'days'; current: number; best: number; activeToday: boolean }
interface WorkoutPillar {
  unit: 'days'; current: number; best: number
  thisWeek: number; target: number | null; metThisWeek: boolean; weekLost: boolean
  weeksOnTarget: number; remainingThisWeek: number
}
interface SuperPillar extends DayPillar {
  today: { nutrition: boolean; mindset: boolean; trained: boolean; restDay: boolean; weekOnTrack: boolean }
  /** Optional on purpose: this page renders from a cached payload first, and a
   *  cache written before freezes existed has no `freeze` at all. Reading it
   *  unguarded is what took the whole page down with "This page couldn't load". */
  freeze?: { available: boolean; returnsOn: string | null; usedDays: string[]; frozenToday: boolean }
}
interface StreaksPayload {
  todayKey: string
  minVisible: number
  overall: {
    current: number
    best: number
    freezes: number
    milestonesReached: number[]
    nextMilestone: number | null
    activeToday: boolean
  }
  pillars: {
    workout: WorkoutPillar
    nutrition: DayPillar
    mindset: DayPillar
    super: SuperPillar
  }
}

const CACHE_KEY = 'streaks'

function unitWord(n: number, unit: 'days' | 'weeks'): string {
  const one = unit === 'days' ? 'day' : 'week'
  return `${n} ${n === 1 ? one : unit}`
}

/** The big number, or the "Building" state before a streak exists. */
/** A day key as a short date — the keys are plain YYYY-MM-DD, read in UTC so
 *  the label cannot slide a day west of Greenwich. */
function fmtDay(key: string): string {
  const d = new Date(`${key}T12:00:00Z`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function StreakValue({ current, unit, tone, fire = false }: { current: number; unit: 'days' | 'weeks'; tone: string; fire?: boolean }) {
  const d = streakDisplay(current)
  if (!d.visible) {
    return (
      <div>
        <p className="text-2xl font-extrabold tracking-tight text-zinc-400 dark:text-zinc-500">Building</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {current}/{STREAK_VISIBLE_MIN} {unit} · {d.remaining} more to start
        </p>
      </div>
    )
  }
  return (
    <div>
      <p className={`text-3xl font-extrabold tracking-tight ${tone}`}>
        {fire ? <FireNumber>{current}</FireNumber> : current}
        <span className="ml-1 text-base font-semibold text-zinc-500 dark:text-zinc-400">{unit}</span>
      </p>
    </div>
  )
}

function BuildBar({ current, tone }: { current: number; tone: string }) {
  const d = streakDisplay(current)
  if (d.visible) return null
  const pct = Math.round((Math.min(current, STREAK_VISIBLE_MIN) / STREAK_VISIBLE_MIN) * 100)
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function TodayDot({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${done ? 'text-green-600 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
      {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
      {label}
    </span>
  )
}

export default function StreaksClient() {
  const [data, setData] = useState<StreaksPayload | null>(() => readCache<StreaksPayload>(CACHE_KEY))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch(`/api/streaks?tz=${new Date().getTimezoneOffset()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as StreaksPayload
        if (cancelled) return
        setData(json)
        writeCache(CACHE_KEY, json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)

  /** Spend the one freeze on today, and take back the streak it just saved. */
  const useFreeze = async () => {
    if (freezing) return
    setFreezing(true)
    setFreezeError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/streaks/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ tz: new Date().getTimezoneOffset() }),
      })
      const json = (await res.json().catch(() => ({}))) as { streaks?: StreaksPayload; error?: string }
      if (!res.ok) throw new Error(json.error || 'Could not use your freeze')
      if (json.streaks) { setData(json.streaks); writeCache(CACHE_KEY, json.streaks) }
    } catch (e) {
      setFreezeError(e instanceof Error ? e.message : 'Could not use your freeze')
    } finally {
      setFreezing(false)
    }
  }

  const overall = data?.overall
  const p = data?.pillars

  return (
    <PageTransition className="pb-24">
      <div className="space-y-4">
        <header className="flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Streaks</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Three in a row makes a streak</p>
          </div>
        </header>

        {error && !data && (
          <Card variant="compact">
            <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load your streaks. Pull to refresh.</p>
          </Card>
        )}

        {/* ── Overall ─────────────────────────────────────────────────── */}
        <Card data-testid="streak-overall">
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30 ${overall?.activeToday ? '' : 'opacity-60'}`}>
              <Flame className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Day streak</p>
                {overall && overall.freezes > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400">
                    <Snowflake className="h-3.5 w-3.5" />
                    {overall.freezes} freeze{overall.freezes === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {overall ? (
                <>
                  <div className="mt-1">
                    <StreakValue current={overall.current} unit="days" tone="text-zinc-900 dark:text-white" />
                    <BuildBar current={overall.current} tone="bg-amber-500" />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Any activity keeps it alive: a workout, a meal, a weigh-in or a mood check-in.
                    {overall.best > 0 && <> Best: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{unitWord(overall.best, 'days')}</span>.</>}
                    {overall.nextMilestone && streakDisplay(overall.current).visible && (
                      <> Next milestone at {overall.nextMilestone}.</>
                    )}
                  </p>
                  <div className="mt-2">
                    <TodayDot done={overall.activeToday} label={overall.activeToday ? 'Done today' : 'Nothing logged yet today'} />
                  </div>
                </>
              ) : (
                <div className="mt-2 h-8 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              )}
            </div>
          </div>
        </Card>

        {/* ── Pillars ─────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Workout */}
          <Card data-testid="streak-workout">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
                <Dumbbell className="h-5 w-5 text-green-600 dark:text-green-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Workout streak</p>
                {p ? (
                  p.workout.target ? (
                    <>
                      <div className="mt-1">
                        <StreakValue current={p.workout.current} unit="days" tone="text-zinc-900 dark:text-white" />
                        <BuildBar current={p.workout.current} tone="bg-green-500" />
                      </div>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Days in a row your training week stayed on track. You train {p.workout.target}× a week —
                        {' '}<span className="font-medium text-zinc-700 dark:text-zinc-200">rest days count</span>, and
                        falling short of that weekly target is what breaks it.
                        {p.workout.best > 0 && <> Best: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{unitWord(p.workout.best, 'days')}</span>.</>}
                        {p.workout.weeksOnTarget > 0 && <> {unitWord(p.workout.weeksOnTarget, 'weeks')} in a row on target.</>}
                      </p>
                      <div className="mt-2">
                        <TodayDot
                          done={p.workout.metThisWeek}
                          label={
                            p.workout.metThisWeek
                              ? `This week ${p.workout.thisWeek}/${p.workout.target} · target hit`
                              : p.workout.weekLost
                                ? `This week ${p.workout.thisWeek}/${p.workout.target} · can't reach ${p.workout.target} this week`
                                : `This week ${p.workout.thisWeek}/${p.workout.target} · ${p.workout.remainingThisWeek} to go`
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Set how many days a week you train in{' '}
                      <Link href="/dashboard/settings" className="font-medium text-blue-600 dark:text-blue-400">Settings</Link>{' '}
                      and this counts the days your training week stays on track.
                    </p>
                  )
                ) : (
                  <div className="mt-2 h-8 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                )}
              </div>
            </div>
          </Card>

          {/* Nutrition */}
          <Card data-testid="streak-nutrition">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                <UtensilsCrossed className="h-5 w-5 text-red-600 dark:text-red-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Nutrition streak</p>
                {p ? (
                  <>
                    <div className="mt-1">
                      <StreakValue current={p.nutrition.current} unit="days" tone="text-zinc-900 dark:text-white" />
                      <BuildBar current={p.nutrition.current} tone="bg-red-500" />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Days in a row you logged food.
                      {p.nutrition.best > 0 && <> Best: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{unitWord(p.nutrition.best, 'days')}</span>.</>}
                    </p>
                    <div className="mt-2">
                      <TodayDot done={p.nutrition.activeToday} label={p.nutrition.activeToday ? 'Logged today' : 'Log a meal to keep it'} />
                    </div>
                  </>
                ) : (
                  <div className="mt-2 h-8 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                )}
              </div>
            </div>
          </Card>

          {/* Mindset */}
          <Card data-testid="streak-mindset">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
                <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Mindset streak</p>
                {p ? (
                  <>
                    <div className="mt-1">
                      <StreakValue current={p.mindset.current} unit="days" tone="text-zinc-900 dark:text-white" />
                      <BuildBar current={p.mindset.current} tone="bg-purple-500" />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Days in a row with a mood check-in, a Mind check-in, a session or a journal entry.
                      {p.mindset.best > 0 && <> Best: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{unitWord(p.mindset.best, 'days')}</span>.</>}
                    </p>
                    <div className="mt-2">
                      <TodayDot done={p.mindset.activeToday} label={p.mindset.activeToday ? 'Checked in today' : 'Check in to keep it'} />
                    </div>
                  </>
                ) : (
                  <div className="mt-2 h-8 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                )}
              </div>
            </div>
          </Card>

          {/* Super */}
          <Card data-testid="streak-super" className="border-orange-200/70 dark:border-orange-900/40">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-900/40 dark:to-orange-900/30">
                <Flame className="h-5 w-5 text-orange-700 dark:text-orange-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Super streak</p>
                {p ? (
                  <>
                    <div className="mt-1">
                      <StreakValue current={p.super.current} unit="days" tone="text-orange-700 dark:text-orange-400" fire />
                      <BuildBar current={p.super.current} tone="bg-orange-600 dark:bg-orange-500" />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      All three pillars, every day: food logged, mindset checked in, and trained (a scheduled rest day counts) — with the training week on track.
                      {p.super.best > 0 && <> Best: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{unitWord(p.super.best, 'days')}</span>.</>}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      <TodayDot done={p.super.today.nutrition} label="Food" />
                      <TodayDot done={p.super.today.mindset} label="Mindset" />
                      <TodayDot done={p.super.today.trained} label={p.super.today.restDay ? 'Rest day' : 'Trained'} />
                      <TodayDot done={p.super.today.weekOnTrack} label="Week on track" />
                    </div>

                    {/* The one freeze. Strict is the point — this is the single
                        deliberate exception, and it costs a month to earn back. */}
                    {p.super.freeze && (
                    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/50 dark:bg-sky-950/30" data-testid="super-freeze">
                      <div className="flex items-start gap-2">
                        <Snowflake className={`mt-0.5 h-4 w-4 shrink-0 ${p.super.freeze.available ? 'text-sky-500' : 'text-zinc-400 dark:text-zinc-600'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {p.super.freeze.frozenToday
                              ? 'Today is frozen — the streak holds'
                              : p.super.freeze.available
                                ? 'One freeze, in hand'
                                : 'Freeze spent'}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                            {p.super.freeze.frozenToday
                              ? 'It comes back in a month.'
                              : p.super.freeze.available
                                ? 'Covers one day the super streak would otherwise break. You get it back a month after you use it.'
                                : p.super.freeze.returnsOn
                                  ? `Back on ${fmtDay(p.super.freeze.returnsOn)}.`
                                  : 'Recharging.'}
                          </p>
                          {freezeError && <p className="mt-1 text-[11px] text-red-500">{freezeError}</p>}
                        </div>
                        {p.super.freeze.available && !p.super.freeze.frozenToday && !p.super.activeToday && p.super.current >= (data?.minVisible ?? 3) && (
                          <button
                            onClick={useFreeze}
                            disabled={freezing}
                            data-testid="use-freeze"
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sky-600 disabled:opacity-60"
                          >
                            {freezing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Snowflake className="h-3.5 w-3.5" />}
                            Use it
                          </button>
                        )}
                      </div>
                    </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2 h-8 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}
