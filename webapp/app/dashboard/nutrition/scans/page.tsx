'use client'

// Scan history — a browsable list of the user's saved AI nutrition scans
// (photo / describe). Each can be re-logged to today or deleted.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState, Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { getToken } from '@/lib/clientAuth'
import { Camera, PencilLine, Pencil, ArrowLeft, Trash2, RotateCcw, Loader2, X, Maximize2 } from 'lucide-react'
import { useMealSchedule } from '@/hooks/useMealSchedule'

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

function authHeaders(): HeadersInit {
  const t = getToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}


function whenLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ScanHistoryPage() {
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Full-image lightbox — holds the src of the photo being viewed (full-res
  // imageUrl when we have it, else the inline thumb).
  const [lightbox, setLightbox] = useState<string | null>(null)
  const { toast, showToast } = useToast(3000)
  const { defaultTagNow } = useMealSchedule()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/nutrition/scans?limit=60', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setScans(Array.isArray(data.scans) ? data.scans : [])
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const logAgain = async (scan: Scan) => {
    if (busyId) return
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
      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ items, tags: [scan.tag || defaultTagNow()], loggedAt: new Date().toISOString() }),
      })
      showToast(res.ok ? 'Logged to today' : 'Could not log. Try again.', res.ok ? 'success' : 'error')
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
                    onClick={() => logAgain(scan)}
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
