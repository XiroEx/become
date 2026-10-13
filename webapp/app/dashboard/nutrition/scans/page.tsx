'use client'

// Scan history — a browsable list of the user's saved AI nutrition scans
// (photo / describe). Each can be re-logged (to a chosen day, time and tag)
// or deleted.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState, Toast } from '@/components/ui'
import DateOnlyPicker, { formatDatePillLabel } from '@/components/ui/DateOnlyPicker'
import { useToast } from '@/hooks/useToast'
import { getToken } from '@/lib/clientAuth'
import {
  Camera, PencilLine, Pencil, ArrowLeft, Trash2, RotateCcw, Loader2, X, Maximize2,
  Tag as TagIcon, ChevronDown, Check, Clock,
} from 'lucide-react'
import { useMealSchedule } from '@/hooks/useMealSchedule'
import { todayLocalKey } from '@/lib/mealPlanDates'
import { anchorMinutesForTag, formatHHMM, formatClockLabel, parseHHMM, minutesOfDay } from '@/lib/nutrition/mealSchedule'
import { resolveLogAgainTimestamp, type LogAgainTimeMode } from '@/lib/nutrition/resolveLogAgainTimestamp'

interface ScanItem {
  foodId?: string
  name: string
  brand?: string
  estimatedServing?: string
  servingSize: number
  servingUnit: string
  servings: number
  nutrition: { calories: number; protein: number; carbs: number; fats: number }
  confidence?: number
  matchKind?: 'food' | 'meal' | 'recipe'
}
interface Scan {
  _id: string
  source: 'photo' | 'describe'
  note?: string
  tag?: string
  thumb?: string
  imageUrl?: string
  items: ScanItem[]
  totalNutrition: { calories: number; protein: number; carbs: number; fats: number }
  createdAt: string
}

const DEFAULT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']

function authHeaders(): HeadersInit {
  const t = getToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function whenLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

export default function ScanHistoryPage() {
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Full-image lightbox — holds the src of the photo being viewed (full-res
  // imageUrl when we have it, else the inline thumb).
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: DEFAULT_TAGS, userTags: [],
  })
  // "Log to a day" sheet — the single entry point for a (re)log, opened from
  // "Log again". Lets the day, time and tag be chosen instead of always
  // landing on "now, untimed, saved tag".
  const [dateSheet, setDateSheet] = useState<{
    scan: Scan
    date: string | null
    tag: string
    timeMode: LogAgainTimeMode
    time: string | null
  } | null>(null)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState('')
  const { toast, showToast } = useToast(3000)
  const { windows, defaultTagNow } = useMealSchedule()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/nutrition/scans?limit=60', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setScans(Array.isArray(data.scans) ? data.scans : [])
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTagsResp({
          defaults: Array.isArray(data.defaults) ? data.defaults : DEFAULT_TAGS,
          userTags: Array.isArray(data.userTags) ? data.userTags : [],
        })
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load(); loadTags() }, [load, loadTags])

  const allTagOptions = useMemo<string[]>(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...tagsResp.defaults, ...tagsResp.userTags]) {
      const norm = String(t).toLowerCase()
      if (norm && !seen.has(norm)) {
        seen.add(norm)
        out.push(norm)
      }
    }
    return out
  }, [tagsResp])

  const openLogSheet = (scan: Scan) => {
    setDateSheet({ scan, date: null, tag: scan.tag || defaultTagNow(), timeMode: 'none', time: null })
    setTagDropdownOpen(false)
    setCustomTagInput('')
  }

  const handleAddCustomTag = () => {
    const norm = customTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    setDateSheet((s) => (s ? { ...s, tag: norm } : s))
    setCustomTagInput('')
    setTagDropdownOpen(false)
  }

  // `dateKey` (YYYY-MM-DD) backdates the log onto that day; `timeMode`/`time`
  // follow the Now/Custom/None model the rest of nutrition logging uses (see
  // resolveLogAgainTimestamp). Defaults reproduce the old one-tap behavior:
  // today, the scan's saved tag, untimed.
  const logAgain = async (
    scan: Scan,
    opts: { dateKey?: string | null; tag?: string; timeMode?: LogAgainTimeMode; time?: string | null } = {},
  ) => {
    if (busyId) return
    const {
      dateKey = null,
      tag = scan.tag || defaultTagNow(),
      timeMode = 'none',
      time = null,
    } = opts
    setBusyId(scan._id)
    try {
      const items = scan.items.map((it) => ({
        ...(it.foodId ? { foodId: it.foodId } : {}),
        name: it.name,
        ...(it.brand ? { brand: it.brand } : {}),
        servingSize: it.servingSize ?? 1,
        servingUnit: it.servingUnit ?? 'serving',
        servings: it.servings ?? 1,
        nutrition: it.nutrition,
      }))
      const anchorHHMM = formatHHMM(anchorMinutesForTag(windows, tag))
      const { loggedAt, untimed } = resolveLogAgainTimestamp(dateKey, timeMode, time, anchorHHMM)
      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ items, tags: [tag], loggedAt, untimed }),
      })
      showToast(
        res.ok ? `Logged to ${dateKey ? formatDatePillLabel(dateKey) : 'today'}` : 'Could not log. Try again.',
        res.ok ? 'success' : 'error',
      )
    } catch {
      showToast('Could not log. Check your connection.', 'error')
    } finally { setBusyId(null) }
  }

  const remove = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    const prev = scans
    setScans((s) => s.filter((x) => x._id !== id))
    try {
      const res = await fetch(`/api/nutrition/scans/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) { setScans(prev); showToast('Could not delete.', 'error') }
    } catch { setScans(prev); showToast('Could not delete.', 'error') } finally { setBusyId(null) }
  }

  return (
    <PageTransition className="pb-6">
      <Toast toast={toast} />
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/dashboard/nutrition"
          aria-label="Back to nutrition"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Estimate history</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Your past photo &amp; describe estimates</p>
        </div>
      </header>

      {loading ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      ) : scans.length === 0 ? (
        <EmptyState
          icon={<Camera className="h-8 w-8" />}
          title="No estimates yet"
          description="Snap or describe a meal in Nutrition and your estimate will show up here."
        />
      ) : (
        <div className="space-y-3" data-tour="scans-list">
          {scans.map((scan) => (
            <Card key={scan._id} className="!p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {scan.thumb || scan.imageUrl ? (
                    <button
                      type="button"
                      onClick={() => setLightbox(scan.imageUrl || scan.thumb || null)}
                      aria-label="View full photo"
                      className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={scan.thumb || scan.imageUrl} alt="Meal photo" className="h-10 w-10 object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                        <Maximize2 className="h-3.5 w-3.5 text-white" />
                      </span>
                    </button>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                      {scan.source === 'describe' ? <PencilLine className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {Math.round(scan.totalNutrition?.calories ?? 0)} cal
                      <span className="ml-2 text-xs font-normal text-zinc-400">{scan.tag ? `· ${scan.tag}` : ''}</span>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{whenLabel(scan.createdAt)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/dashboard/nutrition?scan=${scan._id}`}
                    aria-label="Edit and re-log this estimate"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => openLogSheet(scan)}
                    disabled={busyId === scan._id}
                    className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                  >
                    {busyId === scan._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Log again
                  </button>
                  <button
                    onClick={() => remove(scan._id)}
                    disabled={busyId === scan._id}
                    aria-label="Delete estimate"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                {scan.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                        {it.servings !== 1 ? `${it.servings}× ` : ''}{it.name}
                        {it.matchKind && (
                          <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {it.matchKind === 'food' ? 'in your foods' : it.matchKind}
                          </span>
                        )}
                      </p>
                      {it.brand && <p className="truncate text-[11px] text-zinc-400">{it.brand}</p>}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      {Math.round((it.nutrition?.calories ?? 0) * (it.servings ?? 1))} cal
                    </span>
                  </div>
                ))}
              </div>
              {scan.note && (
                <p className="mt-3 border-t border-zinc-100 pt-2 text-xs italic text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  “{scan.note}”
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* "Log to a day" sheet — day, time and tag for a (re)log, opened from
          "Log again" instead of logging instantly. */}
      {dateSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setDateSheet(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Log to a day"
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Log to a day</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Pick the day, time and tag this estimate was actually eaten.
            </p>

            {/* Tag picker */}
            <div className="relative mt-3">
              <button
                type="button"
                onClick={() => setTagDropdownOpen(v => !v)}
                className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <TagIcon className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Adding to</span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {titleCaseTag(dateSheet.tag)}
                </span>
                <ChevronDown className={`ml-auto h-4 w-4 text-zinc-400 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {tagDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="grid grid-cols-2 gap-1">
                    {allTagOptions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setDateSheet((s) => (s ? { ...s, tag: t } : s)); setTagDropdownOpen(false) }}
                        className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                          dateSheet.tag === t
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                        }`}
                      >
                        <span className="truncate">{titleCaseTag(t)}</span>
                        {dateSheet.tag === t && <Check className="h-3 w-3 shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                    <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      New tag
                    </p>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTag() } }}
                        placeholder="e.g. brunch"
                        className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400/30 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomTag}
                        disabled={!customTagInput.trim()}
                        className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DateOnlyPicker
              value={dateSheet.date ?? todayLocalKey()}
              maxDate={todayLocalKey()}
              showTodayChip
              className="mt-3"
              onChange={(next) => {
                const today = todayLocalKey()
                setDateSheet((s) => (s ? { ...s, date: next === today ? null : next } : s))
              }}
            />

            {/* Time — same Now/pick a time/no time model the rest of nutrition
                logging uses, so logging an estimate behaves like logging food. */}
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/60">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="shrink-0 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Time</span>
                <input
                  type="time"
                  value={dateSheet.timeMode === 'custom' && dateSheet.time ? dateSheet.time : formatHHMM(minutesOfDay(new Date()))}
                  onChange={(ev) => {
                    const v = ev.target.value
                    setDateSheet((s) => (s ? { ...s, time: v || null, timeMode: v ? 'custom' : 'none' } : s))
                  }}
                  disabled={dateSheet.timeMode === 'none'}
                  aria-label="Time this was eaten"
                  className="ml-auto rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums text-zinc-900 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
                />
                {dateSheet.timeMode === 'custom' && dateSheet.time && (
                  <span className="shrink-0 text-[11px] tabular-nums text-blue-600 dark:text-blue-300">
                    {formatClockLabel(parseHHMM(dateSheet.time) ?? 0)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDateSheet((s) => (s ? { ...s, time: null, timeMode: 'now' } : s))}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    dateSheet.timeMode === 'now'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                      : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setDateSheet((s) => (s ? { ...s, time: null, timeMode: 'none' } : s))}
                  aria-label="Clear the time and log for the day only"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                    dateSheet.timeMode === 'none'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                      : 'text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                {dateSheet.timeMode === 'none'
                  ? 'No time. This sits in your meal order rather than at a clock position.'
                  : 'Tap the X to log for the day with no time at all.'}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDateSheet(null)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { scan, date, tag, timeMode, time } = dateSheet
                  setDateSheet(null)
                  logAgain(scan, { dateKey: date, tag, timeMode, time })
                }}
                disabled={busyId === dateSheet.scan._id}
                className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
              >
                Log to {dateSheet.date ? formatDatePillLabel(dateSheet.date) : 'today'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-image lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Meal photo"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close photo"
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Meal photo"
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </PageTransition>
  )
}
