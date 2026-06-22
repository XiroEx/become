"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import { Toast } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { useToast } from '@/hooks/useToast'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Clock } from 'lucide-react'
import {
  fetchPlansInRange,
  tintForCalories,
  TINT_CLASSES,
  type MealPlan,
} from '@/app/dashboard/timeline/planning'
import type { IFoodEntry } from '@/lib/nutritionTypes'

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay()) // Sunday start
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function titleCase(s: string): string {
  return s.split(/[-_\s]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-')
}

export default function MealPlanPage() {
  const { toast, showToast } = useToast()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [goalCal, setGoalCal] = useState(0)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({ defaults: [], userTags: [] })
  const [picker, setPicker] = useState<{ date: Date; tag: string } | null>(null)

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const fetchWeek = useCallback(async () => {
    setLoading(true)
    try {
      const from = ymd(days[0])
      const to = ymd(days[6])
      const data = await fetchPlansInRange(from, to, getHeaders())
      setPlans(data.plans.filter(p => p.status === 'active'))
    } catch {
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [days, getHeaders])

  const fetchGoalAndTags = useCallback(async () => {
    try {
      const [g, t] = await Promise.all([
        fetch('/api/nutrition/goals', { headers: getHeaders() }),
        fetch('/api/tags', { headers: getHeaders() }),
      ])
      if (g.ok) { const gd = await g.json(); setGoalCal(Number(gd?.calories) || 0) }
      if (t.ok) {
        const td = await t.json()
        setTagsResp({
          defaults: Array.isArray(td.defaults) ? td.defaults : [],
          userTags: Array.isArray(td.userTags) ? td.userTags : [],
        })
      }
    } catch { /* non-fatal */ }
  }, [getHeaders])

  useEffect(() => { fetchWeek() }, [fetchWeek])
  useEffect(() => { fetchGoalAndTags() }, [fetchGoalAndTags])

  // plans grouped by dateKey → list
  const byDay = useMemo(() => {
    const m = new Map<string, MealPlan[]>()
    for (const p of plans) {
      const arr = m.get(p.plannedDateKey)
      if (arr) arr.push(p); else m.set(p.plannedDateKey, [p])
    }
    return m
  }, [plans])

  const dayCalories = (dayKey: string): number =>
    (byDay.get(dayKey) ?? []).reduce((s, p) => s + (p.expectedNutrition?.calories ?? 0), 0)

  const handleRemovePlan = async (planId: string) => {
    const prev = plans
    setPlans(p => p.filter(x => x._id !== planId)) // optimistic
    try {
      const res = await fetch(`/api/meal-plans/${planId}`, { method: 'DELETE', headers: getHeaders() })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setPlans(prev)
      showToast('Could not remove', 'error')
    }
  }

  // Add a picked food to the targeted day+slot as a plan.
  const handlePlanFood = async (entry: IFoodEntry, tag?: string) => {
    if (!picker) return
    const useTag = (tag || picker.tag).toLowerCase()
    const e = entry as IFoodEntry & {
      loggedQuantity?: number; loggedUnit?: string; loggedGramsPerServing?: number; loggedMlPerServing?: number
    }
    const item = {
      foodId: entry.foodId, variantId: entry.variantId, variantName: entry.variantName,
      name: entry.name, brand: entry.brand,
      servingSize: entry.servingSize, servingUnit: entry.servingUnit, servings: entry.servings,
      nutrition: entry.nutrition,
      loggedQuantity: e.loggedQuantity, loggedUnit: e.loggedUnit,
      loggedGramsPerServing: e.loggedGramsPerServing, loggedMlPerServing: e.loggedMlPerServing,
    }
    try {
      const res = await fetch('/api/meal-plans', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ plannedDate: ymd(picker.date), tag: useTag, items: [item] }),
      })
      if (!res.ok) { showToast('Could not plan food', 'error'); return }
      setPicker(null)
      await fetchWeek()
    } catch {
      showToast('Could not plan food', 'error')
    }
  }

  const today = ymd(new Date())
  const weekLabel = `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <>
    <PageTransition className="space-y-4 pb-24">
      <header className="mb-1">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Meal Plan</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">Plan your week ahead, one slot at a time.</p>
      </header>

      {/* Week nav */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <button onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Previous week"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="text-sm font-semibold text-zinc-900 dark:text-white">
          {weekLabel}
        </button>
        <button onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Next week"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      ) : (
        <div className="space-y-3">
          {days.map(day => {
            const dayKey = ymd(day)
            const dayPlans = byDay.get(dayKey) ?? []
            const cals = Math.round(dayCalories(dayKey))
            const tint = TINT_CLASSES[tintForCalories(cals, goalCal)]
            const isToday = dayKey === today
            // Slots to show: the 4 standard, plus any custom tags present.
            const extraTags = Array.from(new Set(dayPlans.map(p => p.tag.toLowerCase()))).filter(t => !SLOTS.includes(t as typeof SLOTS[number]))
            const slotList = [...SLOTS, ...extraTags]
            return (
              <div key={dayKey} className={`overflow-hidden rounded-xl border ${isToday ? 'border-zinc-900 dark:border-white' : 'border-zinc-200 dark:border-zinc-800'} bg-white dark:bg-zinc-900`}>
                <div className={`flex items-center justify-between px-3 py-2 ${tint}`}>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                    <span className="text-zinc-400">{day.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span>
                    {isToday && <span className="ml-1.5 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white dark:bg-white dark:text-black">Today</span>}
                  </span>
                  {cals > 0 && (
                    <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                      {cals}{goalCal > 0 ? ` / ${goalCal}` : ''} cal
                    </span>
                  )}
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {slotList.map(slot => {
                    const slotPlans = dayPlans.filter(p => p.tag.toLowerCase() === slot)
                    return (
                      <div key={slot} className="flex items-start gap-2 px-3 py-2">
                        <span className="mt-1 w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{titleCase(slot)}</span>
                        <div className="min-w-0 flex-1 space-y-1">
                          {slotPlans.length === 0 ? (
                            <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                          ) : slotPlans.map(plan => (
                            <div key={plan._id} className="flex items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
                                {plan.mealName || plan.items.map(i => i.name).join(', ')}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-zinc-400">{Math.round(plan.expectedNutrition?.calories ?? 0)}</span>
                              <button onClick={() => handleRemovePlan(plan._id)} aria-label="Remove planned item"
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => setPicker({ date: day, tag: slot })} aria-label={`Add to ${slot} on ${dayKey}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Link href="/dashboard/timeline" className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
        <Clock className="h-4 w-4" /> View day-by-day timeline
      </Link>

      <Toast toast={toast} />
    </PageTransition>

    {/* Plan a food into the chosen day + slot (plan mode = no time picker) */}
    <FoodSearchModal
      isOpen={!!picker}
      currentTag={picker?.tag}
      availableTags={tagsResp}
      viewedDate={picker?.date ?? new Date()}
      mode="plan"
      onClose={() => setPicker(null)}
      onSelectFood={handlePlanFood}
    />
    </>
  )
}
