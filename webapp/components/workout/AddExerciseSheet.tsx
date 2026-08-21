'use client'

// Add an exercise to a workout that is already underway.
//
// One sheet, three homes: the live view, the track view, and the session
// editor. It searches the catalog and your own custom exercises (and will
// create a custom one on the spot when the machine you are standing at is not
// in the catalog), sets a prescription, and decides where the exercise lands —
// on its own at the end, or straight into the superset you are in the middle
// of. The caller owns persistence; this hands back a plain exercise plus a
// placement.
//
// `tone="dark"` is for the immersive live view, which is black regardless of
// the app theme. Everything else uses the app's own light/dark surfaces.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Plus, X, Loader2, Layers, Minus } from 'lucide-react'
import CustomExerciseBadge from '@/components/workout/CustomExerciseBadge'
import type { WorkoutExercise } from '@/lib/workoutUtils'
import type { GroupKind } from '@/lib/workout/buildAsYouGo'
import { setUnitLabel, categoryForTracking } from '@/lib/workout/tracking'

export type Placement = 'end' | 'group'

export interface AddExerciseResult {
  exercise: WorkoutExercise
  placement: Placement
  /** Only meaningful for placement 'group'. */
  groupKind: GroupKind
}

interface SearchExercise {
  slug: string
  name: string
  trackingType: string
}

export interface AddExerciseSheetProps {
  open: boolean
  onClose: () => void
  onAdd: (result: AddExerciseResult) => void | Promise<void>
  /** The exercise the member is standing in, if any — the superset anchor. */
  anchorName?: string
  /** True when the anchor already belongs to a group, so we say "add into it". */
  anchorInGroup?: boolean
  tone?: 'dark' | 'app'
  title?: string
}

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

const isTimed = (t?: string) => !!t && (t.startsWith('time') || t === 'intervals')

const CUSTOM_TRACKING_OPTIONS: { value: string; label: string }[] = [
  { value: 'reps_weight', label: 'Sets & Reps' },
  { value: 'reps_bodyweight', label: 'Bodyweight' },
  { value: 'reps_only', label: 'Reps Only' },
  { value: 'time', label: 'Timed' },
  { value: 'time_distance', label: 'Time + Distance' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'none', label: 'No Tracking' },
]

export default function AddExerciseSheet({
  open,
  onClose,
  onAdd,
  anchorName,
  anchorInGroup = false,
  tone = 'app',
  title = 'Add an exercise',
}: AddExerciseSheetProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchExercise[]>([])
  const [customs, setCustoms] = useState<SearchExercise[]>([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [picked, setPicked] = useState<SearchExercise | null>(null)
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState('8-12')
  const [seconds, setSeconds] = useState(45)
  const [placement, setPlacement] = useState<Placement>('end')
  const [groupKind, setGroupKind] = useState<GroupKind>('superset')
  const [customType, setCustomType] = useState<string>('reps_weight')
  const [adding, setAdding] = useState(false)
  const seq = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const dark = tone === 'dark'

  // Reset every time the sheet opens: it is a one-shot action, and a stale
  // pick from last time reads as the wrong exercise being added.
  useEffect(() => {
    if (!open) return
    setQuery(''); setResults([]); setPicked(null)
    setSets(3); setReps('8-12'); setSeconds(45)
    setPlacement('end'); setGroupKind('superset'); setCustomType('reps_weight')
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open])

  // Your custom exercises, so a machine you named yourself is one search away.
  useEffect(() => {
    if (!open || customs.length) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/exercises/custom', { headers: authHeaders() })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { exercises?: SearchExercise[] }
        if (!cancelled) setCustoms((data.exercises ?? []).map(e => ({ slug: e.slug, name: e.name, trackingType: e.trackingType })))
      } catch { /* customs stay empty */ }
    })()
    return () => { cancelled = true }
  }, [open, customs.length])

  useEffect(() => {
    setCustomType('reps_weight')
  }, [query])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/exercises/search?q=${encodeURIComponent(q)}&limit=8`, { headers: authHeaders() })
        const data = (await res.json()) as { exercises?: SearchExercise[] }
        if (mine === seq.current) setResults(data.exercises ?? [])
      } catch {
        if (mine === seq.current) setResults([])
      } finally {
        if (mine === seq.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const choose = useCallback((r: SearchExercise) => {
    setPicked(r)
    setReps(isTimed(r.trackingType) ? '' : '8-12')
    setQuery('')
    setResults([])
  }, [])

  // The machine in front of you is not always in the catalog.
  const createCustom = useCallback(async () => {
    const name = query.trim()
    if (name.length < 2 || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/exercises/custom', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, trackingType: customType, muscleGroup: 'other', category: categoryForTracking(customType) }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { exercise?: SearchExercise }
      if (data.exercise) {
        setCustoms(prev => [...prev, data.exercise!])
        choose(data.exercise)
      }
    } catch { /* leave the text for a retry */ } finally {
      setCreating(false)
    }
  }, [query, creating, choose, customType])

  const submit = useCallback(async () => {
    if (!picked || adding) return
    setAdding(true)
    const timed = isTimed(picked.trackingType)
    const exercise: WorkoutExercise = {
      name: picked.name,
      exerciseSlug: picked.slug,
      trackingType: picked.trackingType,
      sets,
      reps: timed ? '' : reps.trim() || '8-12',
      ...(timed ? { duration: `${seconds} sec` } : {}),
    }
    try {
      await onAdd({ exercise, placement, groupKind })
      onClose()
    } finally {
      setAdding(false)
    }
  }, [picked, adding, sets, reps, seconds, placement, groupKind, onAdd, onClose])

  if (!open) return null

  const q = query.trim().toLowerCase()
  const customMatches = q.length >= 2 ? customs.filter(c => c.name.toLowerCase().includes(q)) : []
  // Tag the merged rows so the list can mark which ones are yours. The catalog
  // search endpoint excludes customs by design, so `isCustom` has to be
  // attached here rather than coming off the wire.
  const merged = [
    ...results.map(r => ({ ...r, isCustom: false })),
    ...customMatches
      .filter(c => !results.some(r => r.slug === c.slug))
      .map(c => ({ ...c, isCustom: true })),
  ]
  const timed = isTimed(picked?.trackingType)

  const surface = dark
    ? 'bg-zinc-950 text-white ring-1 ring-white/10'
    : 'bg-white text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-white dark:ring-zinc-800'
  const field = dark
    ? 'bg-white/5 text-white placeholder-white/40 ring-1 ring-white/10 focus:ring-green-500'
    : 'bg-zinc-50 text-zinc-900 placeholder-zinc-400 ring-1 ring-zinc-200 focus:ring-green-500 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:ring-zinc-700'
  const rowIdle = dark ? 'hover:bg-white/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
  const muted = dark ? 'text-white/50' : 'text-zinc-500 dark:text-zinc-400'

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" data-testid="add-exercise-sheet">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative max-h-[86vh] w-full overflow-y-auto rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl ${surface}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className={`rounded-full p-1.5 ${rowIdle}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {!picked ? (
          <>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${muted}`} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search exercises…"
                data-testid="add-exercise-search"
                className={`w-full rounded-xl py-2.5 pl-10 pr-9 text-sm outline-none ${field}`}
              />
              {searching && <Loader2 className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin ${muted}`} />}
            </div>

            <div className="mt-3 space-y-1">
              {merged.map(r => (
                <button
                  key={r.slug}
                  onClick={() => choose(r)}
                  data-testid="add-exercise-result"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${rowIdle}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{r.name}</span>
                    {r.isCustom && <CustomExerciseBadge variant="inline" />}
                  </span>
                  <Plus className={`h-4 w-4 shrink-0 ${muted}`} />
                </button>
              ))}
              {q.length >= 2 && !searching && merged.length === 0 && (
                <div className={`rounded-xl px-3 py-2.5 ${dark ? 'bg-white/5' : 'bg-zinc-50 dark:bg-zinc-800'}`}>
                  <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
                    Create &ldquo;{query.trim()}&rdquo; as
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {CUSTOM_TRACKING_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setCustomType(opt.value)}
                        data-testid={`add-exercise-create-type-${opt.value}`}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                          customType === opt.value
                            ? 'bg-green-500 text-white'
                            : dark ? 'bg-white/10 text-white/70' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={createCustom}
                    disabled={creating}
                    data-testid="add-exercise-create-confirm"
                    className={`mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-green-600 dark:text-green-400 ${rowIdle}`}
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create exercise
                  </button>
                </div>
              )}
              {q.length < 2 && <p className={`px-1 py-6 text-center text-xs ${muted}`}>Search for what you are about to do.</p>}
            </div>
          </>
        ) : (
          <>
            <div className={`mb-3 rounded-xl px-3 py-2.5 ${dark ? 'bg-white/5' : 'bg-zinc-50 dark:bg-zinc-800'}`}>
              <p className="text-sm font-semibold">{picked.name}</p>
              <button onClick={() => setPicked(null)} className={`mt-0.5 text-xs underline ${muted}`}>pick a different one</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stepper label={setUnitLabel(picked?.trackingType, sets)} value={sets} onChange={v => setSets(Math.max(1, Math.min(10, v)))} dark={dark} testid="add-exercise-sets" />
              {timed ? (
                <Stepper label="Seconds" value={seconds} step={15} onChange={v => setSeconds(Math.max(5, Math.min(600, v)))} dark={dark} testid="add-exercise-seconds" />
              ) : (
                <label className="block">
                  <span className={`mb-1 block text-[11px] font-semibold uppercase tracking-wide ${muted}`}>Reps</span>
                  <input
                    value={reps}
                    onChange={e => setReps(e.target.value)}
                    inputMode="numeric"
                    data-testid="add-exercise-reps"
                    className={`w-full rounded-xl px-3 py-2 text-sm outline-none ${field}`}
                  />
                </label>
              )}
            </div>

            {anchorName && (
              <div className="mt-4">
                <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${muted}`}>Where it goes</p>
                <div className="space-y-1.5">
                  <PlaceOption
                    active={placement === 'end'}
                    dark={dark}
                    onClick={() => setPlacement('end')}
                    testid="add-exercise-place-end"
                    title="On its own"
                    sub="Runs after everything else"
                  />
                  <PlaceOption
                    active={placement === 'group'}
                    dark={dark}
                    onClick={() => setPlacement('group')}
                    testid="add-exercise-place-group"
                    icon={<Layers className="h-4 w-4" />}
                    title={anchorInGroup ? 'Into this group' : `Superset with ${anchorName}`}
                    sub={anchorInGroup ? 'Same rounds, straight after it' : 'Alternate sets, back to back'}
                  />
                </div>
                {placement === 'group' && !anchorInGroup && (
                  <div className="mt-2 flex gap-1.5">
                    {(['superset', 'circuit'] as GroupKind[]).map(k => (
                      <button
                        key={k}
                        onClick={() => setGroupKind(k)}
                        data-testid={`add-exercise-kind-${k}`}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          groupKind === k
                            ? 'bg-green-500 text-white'
                            : dark ? 'bg-white/10 text-white/70' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {k === 'superset' ? 'Superset' : 'Circuit'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={submit}
              disabled={adding}
              data-testid="add-exercise-confirm"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add to this workout
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Stepper({ label, value, onChange, dark, step = 1, testid }: { label: string; value: number; onChange: (v: number) => void; dark: boolean; step?: number; testid?: string }) {
  const btn = dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200'
  const muted = dark ? 'text-white/50' : 'text-zinc-500 dark:text-zinc-400'
  return (
    <div>
      <span className={`mb-1 block text-[11px] font-semibold uppercase tracking-wide ${muted}`}>{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(value - step)} aria-label={`Fewer ${label}`} className={`flex h-9 w-9 items-center justify-center rounded-xl ${btn}`}>
          <Minus className="h-4 w-4" />
        </button>
        <span data-testid={testid} className="min-w-[2ch] flex-1 text-center text-sm font-bold">{value}</span>
        <button onClick={() => onChange(value + step)} aria-label={`More ${label}`} className={`flex h-9 w-9 items-center justify-center rounded-xl ${btn}`}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function PlaceOption({ active, onClick, title, sub, icon, dark, testid }: { active: boolean; onClick: () => void; title: string; sub: string; icon?: React.ReactNode; dark: boolean; testid?: string }) {
  const base = active
    ? 'ring-2 ring-green-500 ' + (dark ? 'bg-green-500/10' : 'bg-green-50 dark:bg-green-900/20')
    : dark ? 'ring-1 ring-white/10 hover:bg-white/5' : 'ring-1 ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800'
  const muted = dark ? 'text-white/50' : 'text-zinc-500 dark:text-zinc-400'
  return (
    <button onClick={onClick} data-testid={testid} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${base}`}>
      {icon && <span className={active ? 'text-green-500' : muted}>{icon}</span>}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className={`block truncate text-xs ${muted}`}>{sub}</span>
      </span>
    </button>
  )
}
