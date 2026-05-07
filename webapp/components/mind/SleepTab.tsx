'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts'
import { getToken } from '@/lib/clientAuth'
import { Card } from '@/components/ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SleepQuality = 1 | 2 | 3 | 4 | 5

interface SleepEntry {
  _id?: string
  date: string
  bedtime: string
  wakeTime: string
  durationMinutes: number
  quality: SleepQuality
  notes?: string
}

interface SleepData {
  entries: SleepEntry[]
  todayEntry: SleepEntry | null
  averages: { durationMinutes: number; quality: number }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Format a Date to HH:MM for <input type="time"> */
function toTimeInputValue(date: Date | null): string {
  if (!date) return ''
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Given "HH:MM" from an input and a reference date, return a full Date */
function timeInputToDate(timeStr: string, referenceDate: Date): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(referenceDate)
  d.setHours(h, m, 0, 0)
  return d
}

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Quality colors — mirror the mood color pattern used in ProgressChart / MoodModal
const qualityColors: Record<number, string> = {
  1: '#f87171', // red-400   — poor
  2: '#fb923c', // orange-400 — fair
  3: '#fbbf24', // amber-400 — okay
  4: '#a3e635', // lime-400  — good
  5: '#34d399'  // emerald-400 — great
}

const qualityOptions: { value: SleepQuality; label: string; activeClass: string; hoverClass: string }[] = [
  { value: 1, label: 'Poor',  activeClass: 'bg-red-100 border-red-400 text-red-700 dark:bg-red-950/40 dark:border-red-600 dark:text-red-400',    hoverClass: 'hover:border-red-300 dark:hover:border-red-700' },
  { value: 2, label: 'Fair',  activeClass: 'bg-orange-100 border-orange-400 text-orange-700 dark:bg-orange-950/40 dark:border-orange-600 dark:text-orange-400', hoverClass: 'hover:border-orange-300 dark:hover:border-orange-700' },
  { value: 3, label: 'Okay',  activeClass: 'bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-950/40 dark:border-amber-600 dark:text-amber-400',     hoverClass: 'hover:border-amber-300 dark:hover:border-amber-700' },
  { value: 4, label: 'Good',  activeClass: 'bg-lime-100 border-lime-400 text-lime-700 dark:bg-lime-950/40 dark:border-lime-600 dark:text-lime-400',           hoverClass: 'hover:border-lime-300 dark:hover:border-lime-700' },
  { value: 5, label: 'Great', activeClass: 'bg-emerald-100 border-emerald-400 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-600 dark:text-emerald-400', hoverClass: 'hover:border-emerald-300 dark:hover:border-emerald-700' }
]

// ---------------------------------------------------------------------------
// Custom Tooltip for sleep bar chart
// ---------------------------------------------------------------------------

interface TooltipPayload {
  value: number
  payload: { quality: SleepQuality }
}

function SleepTooltip({
  active,
  payload,
  label
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const minutes = payload[0].value
  const quality = payload[0].payload.quality
  const qualityLabel = qualityOptions.find((q) => q.value === quality)?.label ?? ''
  return (
    <div
      style={{
        backgroundColor: '#18181b',
        border: 'none',
        borderRadius: '8px',
        fontSize: '12px',
        padding: '8px 12px'
      }}
    >
      <p style={{ color: '#a1a1aa', marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#fff', margin: 0 }}>{formatDuration(minutes)}</p>
      <p style={{ color: qualityColors[quality] ?? '#fff', margin: 0 }}>{qualityLabel}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sleep tips (static)
// ---------------------------------------------------------------------------

const SLEEP_TIPS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Consistent bedtime',
    body: 'Going to bed and waking up at the same time every day — even weekends — anchors your circadian rhythm.'
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Avoid screens 1 hr before bed',
    body: 'Blue light from phones and laptops suppresses melatonin. Swap the scroll for a book or light stretching.'
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
    title: 'Keep room cool (65–68°F)',
    body: 'Your core body temperature needs to drop to initiate sleep. A cooler room (18–20°C) makes that easier.'
  }
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SleepTab() {
  const [data, setData] = useState<SleepData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state — default bedtime 22:30, wake 06:30
  const [bedtime, setBedtime] = useState('22:30')
  const [wakeTime, setWakeTime] = useState('06:30')
  const [quality, setQuality] = useState<SleepQuality | null>(null)
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch('/api/sleep', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error('Failed to load sleep data')
      const json: SleepData = await res.json()
      setData(json)

      // Pre-fill form if there is already a today entry
      if (json.todayEntry) {
        const bt = new Date(json.todayEntry.bedtime)
        const wt = new Date(json.todayEntry.wakeTime)
        setBedtime(toTimeInputValue(bt))
        setWakeTime(toTimeInputValue(wt))
        setQuality(json.todayEntry.quality)
        setNotes(json.todayEntry.notes ?? '')
        if (json.todayEntry.notes) setShowNotes(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!quality) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const token = getToken()

      // Build full bedtime / wakeTime datetimes.
      // Bedtime is "last night" if bedtime hour >= 20 (8 pm), otherwise today.
      // WakeTime is always today or tomorrow depending on crossing midnight.
      const now = new Date()
      const todayMidnight = new Date(now)
      todayMidnight.setHours(0, 0, 0, 0)

      const [btH, btM] = bedtime.split(':').map(Number)
      const [wtH, wtM] = wakeTime.split(':').map(Number)

      // Bedtime: if hour is in evening (>= 18) treat as yesterday
      const bedtimeDate = new Date(todayMidnight)
      if (btH >= 18) {
        bedtimeDate.setDate(bedtimeDate.getDate() - 1)
      }
      bedtimeDate.setHours(btH, btM, 0, 0)

      // WakeTime: today
      const wakeTimeDate = timeInputToDate(wakeTime, todayMidnight)

      // If wake is earlier than bed in absolute time, push wake by 1 day
      if (wakeTimeDate <= bedtimeDate) {
        wakeTimeDate.setDate(wakeTimeDate.getDate() + 1)
      }

      const res = await fetch('/api/sleep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bedtime: bedtimeDate.toISOString(),
          wakeTime: wakeTimeDate.toISOString(),
          quality,
          notes: notes.trim() || undefined
        })
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to save')
      }

      // Refresh data
      await fetchData()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Chart data — last 7 entries sorted ascending
  // ---------------------------------------------------------------------------

  const chartData = data
    ? [...data.entries]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-7)
        .map((e) => ({
          day: DAY_ABBREVS[new Date(e.date).getDay()],
          durationMinutes: e.durationMinutes,
          quality: e.quality as SleepQuality
        }))
    : []

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300" />
      </div>
    )
  }

  if (error) {
    return (
      <Card
        accent="danger"
        className="!border-red-200 !bg-red-50 dark:!border-red-900/40 dark:!bg-red-950/20"
      >
        <p className="text-sm text-red-600 dark:text-red-400">
          {error}
          <button
            onClick={fetchData}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </p>
      </Card>
    )
  }

  const alreadyLogged = !!data?.todayEntry

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* ------------------------------------------------------------------ */}
      {/* A. Log / Update form card                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white sm:text-xl">
          {alreadyLogged ? 'Update Today\'s Log' : 'Log Tonight\'s Sleep'}
        </h2>

        {/* Time inputs */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Bedtime
            </label>
            <input
              type="time"
              value={bedtime}
              onChange={(e) => setBedtime(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Wake time
            </label>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
        </div>

        {/* Quality selector */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Sleep quality
          </label>
          <div className="flex gap-2">
            {qualityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setQuality(opt.value)}
                className={`flex-1 rounded-md border py-2 text-xs font-semibold transition-all sm:text-sm ${
                  quality === opt.value
                    ? opt.activeClass
                    : `border-zinc-200 bg-transparent text-zinc-600 dark:border-zinc-700 dark:text-zinc-400 ${opt.hoverClass}`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes — collapsible */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showNotes ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {showNotes ? 'Hide note' : 'Add note'}
          </button>
          {showNotes && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Woke up once, felt rested..."
              rows={3}
              maxLength={1000}
              className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          )}
        </div>

        {submitError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {submitError}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!quality || submitting}
          className={`w-full rounded-lg py-3 font-semibold transition-all sm:py-3.5 ${
            quality
              ? 'bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200'
              : 'cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
          }`}
        >
          {submitting ? 'Saving...' : alreadyLogged ? 'Update Sleep' : 'Log Sleep'}
        </button>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* B. Last 7 nights chart (only if >= 2 entries)                      */}
      {/* ------------------------------------------------------------------ */}
      {chartData.length >= 2 && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white sm:text-xl">
            Last 7 nights
          </h2>
          <div className="h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e4e4e7' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'dataMax + 60']}
                  tickFormatter={(v) => `${Math.round(v / 60)}h`}
                />
                <Tooltip content={<SleepTooltip />} />
                {/* 8-hour reference line */}
                <ReferenceLine
                  y={480}
                  stroke="#71717a"
                  strokeDasharray="4 4"
                  label={{ value: '8h', position: 'right', fontSize: 10, fill: '#71717a' }}
                />
                <Bar dataKey="durationMinutes" radius={[4, 4, 0, 0]} name="Sleep">
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={qualityColors[entry.quality] ?? '#71717a'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {qualityOptions.map((opt) => (
              <span key={opt.value} className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: qualityColors[opt.value] }}
                />
                {opt.label}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* C. Stats row                                                        */}
      {/* ------------------------------------------------------------------ */}
      {data && data.entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Card variant="compact">
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Avg duration</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">
              {formatDuration(data.averages.durationMinutes)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">last {data.entries.length} nights</p>
          </Card>
          <Card variant="compact">
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Avg quality</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">
              {data.averages.quality.toFixed(1)}
              <span className="text-base font-normal text-zinc-400 dark:text-zinc-500"> / 5</span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">last {data.entries.length} nights</p>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* D. Sleep tips (static)                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white sm:text-xl">
          Sleep tips
        </h2>
        <div className="space-y-2">
          {SLEEP_TIPS.map((tip, i) => (
            <div
              key={i}
              className="flex gap-3 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/50"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                {tip.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{tip.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{tip.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  )
}
