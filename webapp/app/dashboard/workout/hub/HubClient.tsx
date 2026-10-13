'use client'

// Unified Workout hub — one page, three deep-linkable tabs:
//   Exercises (custom exercise library) · Sessions (quick sessions + builder) ·
//   Programs (my custom programs). The Workout page's header buttons route here
//   with ?tab=exercises / ?tab=programs. Only the active tab's panel is mounted,
//   so the embedded clients' fetches don't all fire at once.

import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dumbbell, Zap, Sparkles, Calendar, Clock, Plus, Upload, ChevronRight, CalendarClock, Bookmark, Loader2, GripVertical } from 'lucide-react'
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState, Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import ExerciseLibraryClient from '../library/ExerciseLibraryClient'
import MyProgramsClient from '../../programs/mine/MyProgramsClient'
import SessionBuilder from '@/components/SessionBuilder'
import ImportSessionFlow from '@/components/workout/ImportSessionFlow'
import { BackButton } from '@/components/ui/BackButton'
import { stashQuickSession, stashQuickSessionWithId, quickSessionOverviewHref } from '@/lib/quickSession/store'
import { isFocusKey, type DraftExercise } from '@/lib/quickSession/types'
import { shouldAutoOpenBuilder } from '@/lib/quickSession/hubLinks'
import UpgradeSheet from '@/components/UpgradeSheet'
import { gateFrom, type GatePayload } from '@/lib/entitlementsClient'

type TabKey = 'exercises' | 'sessions' | 'programs'

const TABS: { key: TabKey; label: string; icon: typeof Dumbbell }[] = [
  { key: 'exercises', label: 'Exercises', icon: Dumbbell },
  { key: 'sessions', label: 'Sessions', icon: Zap },
  { key: 'programs', label: 'Programs', icon: Sparkles },
]

function isTabKey(value: string | null): value is TabKey {
  return value === 'exercises' || value === 'sessions' || value === 'programs'
}

/**
 * An entitlement refusal, or null when the response failed for an ordinary
 * reason (or did not fail at all). Reads the body only on a failure, so the
 * happy path is untouched.
 */
async function refusal(res: Response): Promise<GatePayload | null> {
  return res.ok ? null : gateFrom(res.status, await res.json().catch(() => null))
}

// ─── Sessions tab ──────────────────────────────────────────────────────────────

interface SessionLog {
  kind: 'program' | 'quick'
  title: string
  focus?: string
  date: string
  duration?: number
  exerciseCount: number
  sessionId?: string
  favorite?: boolean
  /** The exercises actually performed. Present for quick sessions saved with
   *  them; absent on very old logs, which fall back to regenerating. */
  exercises?: DraftExercise[]
}

interface PlannedSession {
  sessionId: string
  title: string
  focus?: string
  date: string
  exerciseCount: number
  exercises: DraftExercise[]
  needsName?: boolean
}

function formatPlannedDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfDay.getTime() - startOfToday.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfDay.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

export function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr.slice()
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Favorites always float to the top, in `favoriteOrder` (falling back to
// newest-first for any favorite that hasn't been dragged yet). Everything
// else keeps its original (newest-first) order.
export function sortFavoritesFirst<T extends { sessionId?: string; favorite?: boolean; date: string }>(
  sessions: T[],
  favoriteOrder: string[],
): { favorites: (T & { sessionId: string })[]; others: T[] } {
  const orderIndex = new Map(favoriteOrder.map((id, i) => [id, i]))
  const favorites = sessions
    .filter((s): s is T & { sessionId: string } => !!s.favorite && !!s.sessionId)
    .sort((a, b) => {
      const ai = orderIndex.get(a.sessionId) ?? Infinity
      const bi = orderIndex.get(b.sessionId) ?? Infinity
      if (ai !== bi) return ai - bi
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  const others = sessions.filter((s) => !s.favorite || !s.sessionId)
  return { favorites, others }
}

// One row in the Sessions list. Shared by the reorderable Favorites group and
// the plain history below it — `handleProps`/`cardRef`/`cardProps` are only
// passed for rows rendered inside a Draggable.
function SessionRow({
  log,
  opening,
  togglingFavorite,
  openSession,
  toggleFavorite,
  cardRef,
  cardProps,
  handleProps,
  dragging,
}: {
  log: SessionLog
  opening: string | null
  togglingFavorite: string | null
  openSession: (log: SessionLog) => void
  toggleFavorite: (e: React.MouseEvent, log: SessionLog) => void
  cardRef?: React.Ref<HTMLDivElement>
  cardProps?: React.HTMLAttributes<HTMLDivElement>
  handleProps?: DraggableProvidedDragHandleProps | null
  dragging?: boolean
}) {
  return (
    <Card
      ref={cardRef}
      accent="info"
      onClick={() => openSession(log)}
      className={`flex items-center gap-2 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800/50 ${opening ? 'opacity-60' : 'cursor-pointer'} ${dragging ? 'shadow-lg ring-1 ring-emerald-500/40' : ''}`}
      {...cardProps}
    >
      {handleProps && (
        <div
          {...handleProps}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
          className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-zinc-300 active:cursor-grabbing dark:text-zinc-600"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
          {log.title}
        </h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(log.date)}
          </span>
          <span>
            {log.exerciseCount} {log.exerciseCount === 1 ? 'exercise' : 'exercises'}
          </span>
          {log.duration ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {log.duration} min
            </span>
          ) : null}
        </div>
      </div>
      {log.sessionId && (
        <button
          type="button"
          onClick={(e) => toggleFavorite(e, log)}
          disabled={togglingFavorite === log.sessionId}
          aria-label={log.favorite ? 'Remove from favorites' : 'Add to favorites'}
          title={log.favorite ? 'Remove from favorites' : 'Add to favorites'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          {togglingFavorite === log.sessionId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bookmark className={`h-4 w-4 ${log.favorite ? 'fill-current text-amber-500' : ''}`} />
          )}
        </button>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
    </Card>
  )
}

function SessionsTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sessions, setSessions] = useState<SessionLog[]>([])
  const [planned, setPlanned] = useState<PlannedSession[]>([])
  // Manual drag order for favorited sessions — sessionIds, in display order.
  // A favorite not listed here (never dragged, or just starred) sorts by date
  // among the other un-ordered favorites, still above every non-favorite.
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  // Deep-linked from "Build a custom session" (?build=1) so it opens straight
  // into the builder instead of requiring a second tap on "Build".
  const [building, setBuilding] = useState(() => shouldAutoOpenBuilder(searchParams))
  const [importing, setImporting] = useState(false)
  // Set by ImportSessionFlow, then handed to SessionBuilder as its initialDraft
  // so the paste/upload result lands in the same review-and-edit surface a
  // hand-built session uses. Cleared whenever the builder closes so a later,
  // unrelated "Build" doesn't resurrect a stale import.
  const [importedDraft, setImportedDraft] = useState<ComponentProps<typeof SessionBuilder>['initialDraft']>(undefined)
  const [opening, setOpening] = useState<string | null>(null)
  const [togglingFavorite, setTogglingFavorite] = useState<string | null>(null)
  const [gate, setGate] = useState<GatePayload | null>(null)
  const { toast, showToast } = useToast(2200)

  // Star/unstar a session from the list. Optimistic (the list is the whole
  // point of "quick access"), with a rollback + toast if the PATCH fails.
  //
  // Starring is capped on free; UNSTARRING never is, so a gate refusal here
  // always means "your saved-session slots are full". That gets the same
  // rollback but an upsell rather than a bare "failed" toast, and is checked
  // before the generic throw so it never reaches the catch.
  async function toggleFavorite(e: React.MouseEvent, log: SessionLog) {
    e.stopPropagation()
    const id = log.sessionId
    if (!id || togglingFavorite) return
    const next = !log.favorite
    const undo = () => setSessions((p) => p.map((s) => (s.sessionId === id ? { ...s, favorite: !next } : s)))
    setTogglingFavorite(id)
    setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, favorite: next } : s)))
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/workouts/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ id, favorite: next }),
      })
      const g = await refusal(res)
      if (g) { undo(); setGate(g); return }
      if (!res.ok) throw new Error('favorite toggle failed')
    } catch {
      undo()
      showToast('Failed to update favorite', 'error')
    } finally {
      setTogglingFavorite(null)
    }
  }

  const { favorites: favoriteSessions, others: otherSessions } = useMemo(
    () => sortFavoritesFirst(sessions, favoriteOrder),
    [sessions, favoriteOrder],
  )

  // Drag reorder within Favorites only. Optimistic + persisted as the FULL
  // new favorite order, same pattern as toggleFavorite above.
  async function onFavoriteDragEnd(result: DropResult) {
    if (!result.destination) return
    const from = result.source.index
    const to = result.destination.index
    if (from === to) return
    const ids = favoriteSessions.map((s) => s.sessionId)
    const next = moveInArray(ids, from, to)
    const prev = favoriteOrder
    setFavoriteOrder(next)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/workouts/favorite-order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ order: next }),
      })
      if (!res.ok) throw new Error('reorder failed')
    } catch {
      setFavoriteOrder(prev)
      showToast('Failed to save order', 'error')
    }
  }

  // Open a planned session under its OWN sessionId so finishing it consumes the
  // plan (updates the same log to completed) rather than creating a new one.
  function startPlanned(p: PlannedSession) {
    if (opening) return
    setOpening(p.sessionId)
    stashQuickSessionWithId(
      {
        title: p.title,
        ...(isFocusKey(p.focus) ? { focus: p.focus } : {}),
        exercises: p.exercises,
        source: 'saved',
      },
      p.sessionId,
      { needsName: p.needsName },
    )
    // saved: it already exists server-side under this id, so edits write back.
    router.push(quickSessionOverviewHref(p.sessionId, { saved: true }))
  }

  // Tapping a past session opens THAT session — same title, same exercises.
  //
  // It used to throw the log away and POST /api/generate/session with just its
  // focus, so you tapped "Sunday Back & Shoulders" and got a brand-new (and
  // different every time) "Full Body Session", since focus is usually absent and
  // defaulted to full_body. The exercises were on the log all along; the list
  // endpoint simply wasn't returning them.
  //
  // Opened under a NEW sessionId on purpose: a save matches the log by
  // sessionId and updates it in place, so reusing the completed log's id would
  // overwrite that day's history the moment you finished the repeat.
  async function openSession(log: SessionLog) {
    const key = log.sessionId ?? log.date
    if (opening) return
    setOpening(key)

    if (log.exercises?.length) {
      const id = stashQuickSession(
        {
          title: log.title,
          ...(isFocusKey(log.focus) ? { focus: log.focus } : {}),
          exercises: log.exercises,
          source: 'saved',
        },
        {
          needsName: false,
          ...(log.sessionId ? { sourceSessionId: log.sessionId } : {}),
          ...(log.favorite ? { favorite: true } : {}),
        },
      )
      router.push(quickSessionOverviewHref(id))
      return
    }

    // Legacy log with no stored exercises — nothing to reopen, so fall back to
    // generating a fresh session from its focus (the old behaviour).
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/generate/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ focus: log.focus || 'full_body' }),
      })
      const g = await refusal(res)
      if (g) {
        setGate(g)
        setOpening(null)
        return
      }
      if (!res.ok) throw new Error('generate failed')
      const data = (await res.json()) as { session?: import('@/lib/quickSession/types').DraftSession }
      if (!data.session) throw new Error('no session')
      const id = stashQuickSession(data.session, { needsName: true })
      router.push(quickSessionOverviewHref(id))
    } catch {
      setOpening(null)
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setLoading(false)
          return
        }
        const [res, plannedRes] = await Promise.all([
          // withExercises: the Sessions list needs the real exercises so tapping
          // a session reopens THAT session instead of generating a new one.
          fetch('/api/workouts/logs?withExercises=true', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/workouts/planned', { headers: { Authorization: `Bearer ${token}` } }),
        ])
        if (res.ok) {
          const data = (await res.json()) as { logs?: SessionLog[]; favoriteSessionOrder?: string[] }
          setSessions((data.logs ?? []).filter((l) => l.kind === 'quick'))
          setFavoriteOrder(data.favoriteSessionOrder ?? [])
        }
        if (plannedRes.ok) {
          const pdata = (await plannedRes.json()) as { planned?: PlannedSession[] }
          setPlanned(pdata.planned ?? [])
        }
      } catch (error) {
        console.error('Error loading sessions:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="pb-6">
      {/* Planned (upcoming) sessions — future-dated ones you set with "Log or
          plan". Tap to review + start; finishing consumes the plan. */}
      {planned.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-lg font-semibold text-zinc-900 dark:text-white">
            <CalendarClock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Planned
          </h2>
          <div className="space-y-3">
            {planned.map((p) => (
              <Card
                key={p.sessionId}
                accent="success"
                onClick={() => startPlanned(p)}
                className={`flex items-center gap-3 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800/50 ${opening ? 'opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{p.title}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      <Calendar className="h-3 w-3" /> {formatPlannedDate(p.date)}
                    </span>
                    <span>{p.exerciseCount} {p.exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Header + create toggle (mirrors the Exercises tab) */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Your sessions</h2>
        {!building && !importing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImporting(true)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button
              onClick={() => setBuilding(true)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 active:bg-green-800"
            >
              <Plus className="h-4 w-4" />
              Build
            </button>
          </div>
        )}
      </div>

      {/* Import a session — paste/upload, same idea as program import but for
          one workout (see components/workout/ImportSessionFlow.tsx). Success
          hands off into the same builder panel below for review before saving. */}
      {importing && (
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Import a session</h3>
            <button
              onClick={() => setImporting(false)}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
          <ImportSessionFlow
            onImported={(draft) => {
              setImportedDraft(draft)
              setImporting(false)
              setBuilding(true)
            }}
            onCancel={() => setImporting(false)}
          />
        </div>
      )}

      {/* Inline builder (revealed on demand) */}
      {building && (
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Build a session</h3>
            <button
              onClick={() => {
                setBuilding(false)
                setImportedDraft(undefined)
              }}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
          <SessionBuilder
            initialDraft={importedDraft}
            onLaunch={() => {
              setBuilding(false)
              setImportedDraft(undefined)
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-7 w-7" />}
          title="No sessions yet"
          description={building ? 'Add exercises above to build one.' : 'Tap Build to create your first session.'}
        />
      ) : (
        <>
          {favoriteSessions.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <Bookmark className="h-3 w-3 fill-current text-amber-500" />
                Favorites
              </h3>
              <DragDropContext onDragEnd={onFavoriteDragEnd}>
                <Droppable droppableId="favorite-sessions">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                      {favoriteSessions.map((log, i) => (
                        <Draggable key={log.sessionId} draggableId={log.sessionId} index={i}>
                          {(p, snapshot) => (
                            <SessionRow
                              log={log}
                              opening={opening}
                              togglingFavorite={togglingFavorite}
                              openSession={openSession}
                              toggleFavorite={toggleFavorite}
                              cardRef={p.innerRef}
                              cardProps={p.draggableProps as unknown as React.HTMLAttributes<HTMLDivElement>}
                              handleProps={p.dragHandleProps}
                              dragging={snapshot.isDragging}
                            />
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}

          {otherSessions.length > 0 && (
            <div className="space-y-3">
              {otherSessions.map((log, i) => (
                <SessionRow
                  key={`${log.sessionId ?? log.date}-${i}`}
                  log={log}
                  opening={opening}
                  togglingFavorite={togglingFavorite}
                  openSession={openSession}
                  toggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </>
      )}
      <Toast toast={toast} />
      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
    </div>
  )
}

// ─── Hub ───────────────────────────────────────────────────────────────────────

export default function HubClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramTab = searchParams.get('tab')

  const [tab, setTab] = useState<TabKey>(isTabKey(paramTab) ? paramTab : 'exercises')

  // Keep local state in sync with back/forward navigation.
  useEffect(() => {
    if (isTabKey(paramTab) && paramTab !== tab) {
      setTab(paramTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTab])

  const selectTab = (key: TabKey) => {
    setTab(key)
    router.replace(`/dashboard/workout/hub?tab=${key}`, { scroll: false })
  }

  const tabs = useMemo(() => TABS, [])

  return (
    <PageTransition className="pb-6">
      <header className="mb-4 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">
          My Workout
        </h1>
      </header>

      {/* Segmented tab control */}
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-green-500 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Active panel only */}
      {tab === 'exercises' && <ExerciseLibraryClient embedded />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'programs' && <MyProgramsClient embedded />}
    </PageTransition>
  )
}
