'use client'

// ---------------------------------------------------------------------------
// Admin Foods — list view.
//
// Surfaces the auto-grown Food collection with filter chips for All / Flagged
// / Recent / Custom (manual-source). Search input is debounced; results
// scroll infinitely.
// ---------------------------------------------------------------------------

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Search, AlertCircle, Loader2 } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card } from '@/components/ui/Card'

interface AdminFood {
  _id: string
  name: string
  brand?: string
  category?: string
  source?: 'manual' | 'usda' | 'openfoodfacts'
  externalDataType?: string
  needsReview?: boolean
  groupKey?: string
  servingSize: number
  servingUnit: string
  displayLabel?: string
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  isVerified?: boolean
  usageCount?: number
  updatedAt?: string
  createdAt?: string
}

type FilterMode = 'all' | 'flagged' | 'recent' | 'custom'

const PAGE_SIZE = 50

const SOURCE_LABEL: Record<string, string> = {
  usda: 'USDA',
  openfoodfacts: 'OFF',
  manual: 'CUSTOM',
}

const SOURCE_BADGE_CLASS: Record<string, string> = {
  usda: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  openfoodfacts: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  manual: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

function relativeDate(dateStr?: string): string {
  if (!dateStr) return 'unknown'
  const d = new Date(dateStr)
  const diffMs = Date.now() - d.getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  if (day < 30) return `${Math.floor(day / 7)}w ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

export default function AdminFoodsPage() {
  const router = useRouter()
  const [foods, setFoods] = useState<AdminFood[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [total, setTotal] = useState(0)
  const [flaggedCount, setFlaggedCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadFoods = useCallback(
    async (q: string, f: FilterMode, off: number, append: boolean) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const params = new URLSearchParams({
          offset: String(off),
          limit: String(PAGE_SIZE),
        })
        if (q) params.set('q', q)
        if (f === 'flagged') params.set('flagged', '1')
        if (f === 'custom') params.set('source', 'manual')
        if (f === 'recent') params.set('sortBy', 'recent')
        const res = await fetch(`/api/admin/foods?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          if (!append) setFoods([])
          return
        }
        const data = (await res.json()) as {
          foods: AdminFood[]
          total: number
          flaggedCount: number
        }
        setFlaggedCount(data.flaggedCount)
        setTotal(data.total)
        setHasMore(off + data.foods.length < data.total)
        setFoods(prev => (append ? [...prev, ...data.foods] : data.foods))
      } finally {
        if (append) setLoadingMore(false)
        else setLoading(false)
      }
    },
    [],
  )

  // Initial + filter changes
  useEffect(() => {
    setOffset(0)
    loadFoods(search, filter, 0, false)
  }, [filter, loadFoods]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setOffset(0)
      loadFoods(search, filter, 0, false)
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll sentinel
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading || loadingMore) return
    const target = sentinelRef.current
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          const next = offset + PAGE_SIZE
          setOffset(next)
          loadFoods(search, filter, next, true)
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(target)
    return () => obs.disconnect()
  }, [hasMore, loading, loadingMore, offset, search, filter, loadFoods])

  const filterTabs: { label: string; value: FilterMode; count?: number }[] = [
    { label: 'All', value: 'all' },
    { label: 'Flagged', value: 'flagged', count: flaggedCount },
    { label: 'Recent', value: 'recent' },
    { label: 'Custom', value: 'custom' },
  ]

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Foods</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {total.toLocaleString()} entries{flaggedCount > 0 ? ` · ${flaggedCount.toLocaleString()} flagged` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Search by name, brand, or slug…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
        />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filterTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  filter === tab.value
                    ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900'
                    : 'bg-red-500 text-white'
                }`}
              >
                {tab.count > 999 ? '999+' : tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : foods.length === 0 ? (
        <Card variant="default" className="text-center">
          <p className="py-8 text-sm text-zinc-500 dark:text-zinc-400">
            No foods match this filter.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {foods.map(food => (
            <Card
              key={food._id}
              variant="compact"
              accent={food.needsReview ? 'danger' : 'none'}
              as="button"
              onClick={() => router.push(`/dashboard/admin/foods/${food._id}`)}
              className="text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <div className={`flex items-center gap-3 ${food.needsReview ? 'pl-2' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {food.name}
                    </span>
                    {food.brand && (
                      <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">
                        {food.brand}
                      </span>
                    )}
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        SOURCE_BADGE_CLASS[food.source ?? 'manual']
                      }`}
                    >
                      {SOURCE_LABEL[food.source ?? 'manual']}
                    </span>
                    {food.isVerified && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Verified
                      </span>
                    )}
                    {food.needsReview && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <AlertCircle className="h-2.5 w-2.5" />
                        Review
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {food.displayLabel ?? `${food.servingSize} ${food.servingUnit}`}
                    {' · '}
                    {Math.round(food.nutrition.calories)} cal
                    {food.usageCount != null && food.usageCount > 0 && ` · used ${food.usageCount}×`}
                    {' · '}
                    {relativeDate(food.updatedAt ?? food.createdAt)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </div>
            </Card>
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          )}
        </div>
      )}
    </PageTransition>
  )
}
