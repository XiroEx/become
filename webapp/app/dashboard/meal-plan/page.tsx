"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import { Toast } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { useToast } from '@/hooks/useToast'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Clock, ShoppingCart, Check } from 'lucide-react'
import {
  fetchPlansInRange,
  tintForCalories,
  TINT_CLASSES,
  type MealPlan,
} from '@/app/dashboard/timeline/planning'
import type { IFoodEntry } from '@/lib/nutritionTypes'

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

/** Order meal tags: the standard meals first (in meal-time order), then any
 *  custom tags alphabetically. De-dupes. */
function orderSlots(tags: string[]): string[] {
  return Array.from(new Set(tags.map(t => t.toLowerCase()))).sort((a, b) => {
    const ia = SLOT_ORDER.indexOf(a)
    const ib = SLOT_ORDER.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return a.localeCompare(b)
  })
}

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
  const [groceryOpen, setGroceryOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  // Per-day meal slots the user has revealed beyond the default Breakfast (+ any
  // slot that already has plans). Keyed by dateKey. Lets each day start simple
  // and grow via the centered "+ Add meal" — driven by the meal-tag system.
  const [extraSlots, setExtraSlots] = useState<Record<string, string[]>>({})
  const [addingSlotFor, setAddingSlotFor] = useState<string | null>(null)

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

  // Grocery list — aggregate every planned item across the week by name + unit,
  // summing quantities. The plan's items are already flattened foods (saved
  // meals/recipes expand into items at plan time), so this is the shopping list.
  const grocery = useMemo(() => {
    const map = new Map<string, { key: string; name: string; unit: string; qty: number }>()
    for (const p of plans) for (const it of (p.items ?? [])) {
      const name = (it.name ?? '').trim()
      if (!name) continue
      const unit = it.servingUnit ?? ''
      const key = `${name.toLowerCase()}|${unit.toLowerCase()}`
      const qty = it.servings ?? 1
      const cur = map.get(key)
      if (cur) cur.qty += qty
      else map.set(key, { key, name, unit, qty })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [plans])

  const toggleChecked = (key: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const fmtQty = (n: number) => (Math.round(n * 100) / 100).toString()

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

      {/* Grocery list — aggregated shopping list for the displayed week */}
      <button
        onClick={() => setGroceryOpen(true)}
        disabled={grocery.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        <ShoppingCart className="h-4 w-4" />
        Grocery list{grocery.length > 0 ? ` (${grocery.length})` : ''}
      </button>

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
            // Start with just Breakfast; reveal more meals via the centered "+".
            // Any slot that already has plans is always shown.
            const tagsWithPlans = dayPlans.map(p => p.tag.toLowerCase())
            const slotList = orderSlots(['breakfast', ...tagsWithPlans, ...(extraSlots[dayKey] ?? [])])
            // The meal-tag system: defaults + the user's custom tags. What's left
            // to add is everything not already shown for this day.
            const allTags = orderSlots([...(tagsResp.defaults.length ? tagsResp.defaults : [...SLOTS]), ...tagsResp.userTags])
            const addableTags = allTags.filter(t => !slotList.includes(t))
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
                    // An empty, user-revealed slot (not Breakfast) can be hidden again.
                    const removableEmpty = slot !== 'breakfast' && slotPlans.length === 0 && (extraSlots[dayKey] ?? []).includes(slot)
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
                        {removableEmpty && (
                          <button
                            onClick={() => setExtraSlots(prev => ({ ...prev, [dayKey]: (prev[dayKey] ?? []).filter(t => t !== slot) }))}
                            aria-label={`Hide ${slot}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-zinc-600 dark:hover:bg-red-900/20"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => setPicker({ date: day, tag: slot })} aria-label={`Add to ${slot} on ${dayKey}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}

                  {/* Add another meal slot — driven by the meal-tag system. */}
                  <div className="px-3 py-2">
                    {addingSlotFor === dayKey ? (
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {addableTags.length === 0 ? (
                          <span className="text-xs text-zinc-400">All meals added</span>
                        ) : addableTags.map(t => (
                          <button
                            key={t}
                            onClick={() => {
                              setExtraSlots(prev => ({ ...prev, [dayKey]: orderSlots([...(prev[dayKey] ?? []), t]) }))
                              setAddingSlotFor(null)
                            }}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                          >
                            {titleCase(t)}
                          </button>
                        ))}
                        <button
                          onClick={() => setAddingSlotFor(null)}
                          aria-label="Cancel adding meal"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingSlotFor(dayKey)}
                        disabled={addableTags.length === 0}
                        aria-label={`Add a meal to ${dayKey}`}
                        className="mx-auto flex h-7 items-center justify-center gap-1 rounded-full bg-zinc-100 px-3 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add meal
                      </button>
                    )}
                  </div>
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

    {/* Grocery list — aggregated for the displayed week */}
    {groceryOpen && (
      <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-900 sm:items-center sm:justify-center sm:bg-black/60 sm:p-4"
        onClick={() => setGroceryOpen(false)}>
        <div className="flex h-full w-full flex-col sm:h-[80vh] sm:max-h-[640px] sm:max-w-md sm:overflow-hidden sm:rounded-2xl sm:shadow-2xl"
          onClick={e => e.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Grocery list</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{weekLabel} · {grocery.length} item{grocery.length === 1 ? '' : 's'}</p>
            </div>
            <button onClick={() => setGroceryOpen(false)} aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white p-2 dark:bg-zinc-900">
            {grocery.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-zinc-400">Nothing planned this week yet.</p>
            ) : grocery.map(g => {
              const isChecked = checked.has(g.key)
              return (
                <button key={g.key} onClick={() => toggleChecked(g.key)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isChecked ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {isChecked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${isChecked ? 'text-zinc-400 line-through dark:text-zinc-600' : 'text-zinc-800 dark:text-zinc-200'}`}>{g.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{fmtQty(g.qty)} {g.unit}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )}

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
