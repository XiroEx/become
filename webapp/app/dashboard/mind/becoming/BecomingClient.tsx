'use client'

// The Becoming — the page. Loads the journey (every week, scored and placed
// on the path) and hands it to the stage. "Details" opens the reading view
// (BecomingDetails: arc, pillars, evidence wall) as a sheet over the stage.

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { JourneyPayload } from '@/lib/becoming/journey'
import JourneyCanvas from '@/components/becoming/journey/JourneyCanvas'
import BecomingDetails from '@/components/becoming/BecomingDetails'
import { readCache, writeCache } from '@/lib/clientCache'

// Cached per member (the payload is personal: identity statement, wins) and
// only reused inside the same week — a stale week would start the intro on
// last week's card and restart it when the fresh payload lands.
function cacheKey(): string {
  try {
    const token = localStorage.getItem('token') ?? ''
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { userId?: string }
    return `becoming.journey.${payload.userId ?? 'anon'}`
  } catch { return 'becoming.journey.anon' }
}
function localWeekKey(): string {
  const d = new Date(); d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sameWeek(todayKey: string): boolean {
  const [y, m, dd] = todayKey.split('-').map(Number)
  const d = new Date(y, m - 1, dd); d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === localWeekKey()
}

export default function BecomingClient() {
  const router = useRouter()
  const search = useSearchParams()
  const initialWeekKey = search?.get('week') ?? null
  // Starts empty on both server and client (no hydration mismatch); the same-week
  // cache repaints on the first client effect, the fresh payload replaces it.
  const [data, setData] = useState<JourneyPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState(false)

  useEffect(() => {
    let cancelled = false
    const key = cacheKey()
    const cached = readCache<JourneyPayload>(key)
    if (cached && cached.weeks?.length && sameWeek(cached.todayKey)) setData(cached)
    ;(async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/becoming/journey?tz=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${token ?? ''}` } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = (await res.json()) as JourneyPayload
        if (!cancelled) { setData(j); writeCache(key, j) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Escape closes the sheet first; the stage only sees keys when no sheet is open.
  useEffect(() => {
    if (!details) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setDetails(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [details])

  const close = () => {
    if (window.history.length > 1) router.back()
    else router.push('/dashboard')
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07060d] p-6 text-center text-white">
        <div>
          <p className="text-lg font-bold">Couldn&apos;t load your Becoming</p>
          <p className="mt-1 text-sm text-white/60">{error}</p>
          <button type="button" onClick={close} className="mt-6 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">Back</button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07060d] text-white" data-testid="journey-loading">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/50">The Becoming</p>
          <div className="mx-auto mt-4 h-1 w-24 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-violet-400" /></div>
        </div>
      </div>
    )
  }

  if (data.weeks.length === 0) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07060d] p-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/50">The Becoming</p>
          <h1 className="mt-2 text-3xl font-black">Who am I becoming?</h1>
          <p className="mt-3 text-sm text-white/65">Your first week writes the first card. Log a meal, finish a workout or open a Mind session and come back on Sunday.</p>
          <button type="button" onClick={close} className="mt-6 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">Back</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <JourneyCanvas data={data} onClose={close} onDetails={() => setDetails(true)} initialWeekKey={initialWeekKey} inert={details} />

      {/* Screen-reader / no-gesture fallback: the weeks as a list. */}
      <ol className="sr-only" aria-label="Your Becoming, week by week">
        {data.weeks.map(w => (
          <li key={w.weekKey}>Week {w.index + 1}, {w.label}: {w.headline}. {w.sub}</li>
        ))}
      </ol>

      <AnimatePresence>
        {details && (
          <>
            <motion.div key="bd" className="fixed inset-0 z-[94] bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetails(false)} />
            <motion.div
              key="sheet"
              role="dialog" aria-modal="true" aria-label="Becoming details"
              data-testid="becoming-details"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[95] mx-auto max-h-[88vh] max-w-3xl overflow-y-auto rounded-t-3xl bg-zinc-50 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3 dark:bg-zinc-950 sm:px-6"
            >
              <div className="sticky top-0 z-10 -mx-3 mb-2 flex items-center justify-between bg-zinc-50/90 px-3 py-2 backdrop-blur dark:bg-zinc-950/90 sm:-mx-6 sm:px-6">
                <p className="text-sm font-bold text-zinc-900 dark:text-white">The Becoming · details</p>
                <button type="button" onClick={() => setDetails(false)} aria-label="Close details" className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"><X className="h-4 w-4" /></button>
              </div>
              <BecomingDetails />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
