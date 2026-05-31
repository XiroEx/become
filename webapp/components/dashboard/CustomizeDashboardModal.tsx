"use client"

// Layout-aware dashboard customizer.
//
// Unlike the old CustomizeTilesModal (which only toggled an id list in
// localStorage and never touched the server), this edits the real
// DashboardLayout: enable/disable stat tiles, drag-reorder, resize each tile
// 1x1 ⇄ 2x1, and add/remove the smart-rotating tile. On save it PATCHes
// /api/dashboard/layout (the cross-device source of truth) and hands the new
// layout back to the parent so the grid re-renders immediately.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { GripVertical, Check, X, Sparkles, RectangleHorizontal, Square } from 'lucide-react'
import {
  ALL_TILE_IDS,
  TILE_DEFS,
  type DashboardTileId,
} from '@/lib/dashboardTiles'
import type { DashboardTile, DashboardTileSize } from '@/lib/dashboardLayout/types'
import { SMART_ROTATING_TILE_ID } from '@/lib/dashboardLayout/defaults'
import { useLockScroll } from '@/lib/useLockScroll'

const ACCENT_BADGE_CLASSES: Record<string, string> = {
  green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

const MIN_TILES = 2
const MAX_TILES = 20

const SMART_LABEL = 'Smart Tile'
const SMART_DESCRIPTION = 'Rotates through your most relevant metrics'

interface CustomizeDashboardModalProps {
  open: boolean
  /** Current layout (source of truth from the parent). */
  layout: DashboardTile[]
  onClose: () => void
  /** Called with the persisted layout after a successful save. */
  onSaved: (layout: DashboardTile[]) => void
}

interface Row {
  id: string
  kind: 'stat' | 'smart-rotating'
  enabled: boolean
  size: DashboardTileSize
  label: string
  description: string
}

function labelFor(kind: Row['kind'], id: string): { label: string; description: string } {
  if (kind === 'smart-rotating') {
    return { label: SMART_LABEL, description: SMART_DESCRIPTION }
  }
  const def = TILE_DEFS[id as DashboardTileId]
  return def
    ? { label: def.label, description: def.description }
    : { label: id, description: '' }
}

/**
 * Build editable rows from the current layout: existing tiles first (in order,
 * with their saved size), then any stat tiles not present (disabled), and
 * always exactly one smart-rotating row (enabled iff present in the layout).
 */
function buildInitialRows(layout: DashboardTile[]): Row[] {
  const rows: Row[] = []
  const seenStat = new Set<DashboardTileId>()
  let smartRow: Row | null = null

  for (const tile of layout) {
    if (tile.kind === 'smart-rotating') {
      if (!smartRow) {
        smartRow = {
          id: tile.id || SMART_ROTATING_TILE_ID,
          kind: 'smart-rotating',
          enabled: true,
          size: tile.size,
          ...labelFor('smart-rotating', tile.id),
        }
        rows.push(smartRow)
      }
      continue
    }
    // stat (ignore unknown / metric ids here — those are managed elsewhere)
    if (TILE_DEFS[tile.id as DashboardTileId] && !seenStat.has(tile.id as DashboardTileId)) {
      seenStat.add(tile.id as DashboardTileId)
      rows.push({
        id: tile.id,
        kind: 'stat',
        enabled: true,
        size: tile.size,
        ...labelFor('stat', tile.id),
      })
    }
  }

  for (const id of ALL_TILE_IDS) {
    if (!seenStat.has(id)) {
      rows.push({
        id,
        kind: 'stat',
        enabled: false,
        size: '1x1',
        ...labelFor('stat', id),
      })
    }
  }

  if (!smartRow) {
    rows.push({
      id: SMART_ROTATING_TILE_ID,
      kind: 'smart-rotating',
      enabled: false,
      size: '2x1',
      ...labelFor('smart-rotating', SMART_ROTATING_TILE_ID),
    })
  }

  return rows
}

function MoodBadge() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
      <svg viewBox="0 0 48 48" className="h-5 w-5">
        <circle cx="24" cy="24" r="22" className="fill-emerald-400" />
        <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
        <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
        <path
          d="M14 30 Q24 40 34 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-zinc-700 dark:text-zinc-800"
        />
      </svg>
    </span>
  )
}

function RowBadge({ row }: { row: Row }) {
  if (row.kind === 'smart-rotating') {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
        <Sparkles className="h-4 w-4" />
      </span>
    )
  }
  if (row.id === 'mood') return <MoodBadge />
  const def = TILE_DEFS[row.id as DashboardTileId]
  const Icon = def.Icon
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        ACCENT_BADGE_CLASSES[def.accent] ?? ACCENT_BADGE_CLASSES.zinc
      }`}
    >
      <Icon className="h-4 w-4" />
    </span>
  )
}

export default function CustomizeDashboardModal({
  open,
  layout,
  onClose,
  onSaved,
}: CustomizeDashboardModalProps) {
  useLockScroll(open)
  return (
    <AnimatePresence>
      {open && (
        <CustomizerBody layout={layout} onClose={onClose} onSaved={onSaved} />
      )}
    </AnimatePresence>
  )
}

/**
 * The actual body — only mounted while open, so initial row state is derived
 * from the current layout exactly once per opening (no setState-in-effect).
 */
function CustomizerBody({
  layout,
  onClose,
  onSaved,
}: Omit<CustomizeDashboardModalProps, 'open'>) {
  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(layout))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const enabledCount = rows.filter((r) => r.enabled).length
  const canSave = enabledCount >= MIN_TILES && enabledCount <= MAX_TILES && !saving

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return
    setRows((prev) => {
      const next = Array.from(prev)
      const [moved] = next.splice(result.source.index, 1)
      next.splice(result.destination!.index, 0, moved)
      return next
    })
  }

  const toggleRow = (id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        if (r.enabled && enabledCount <= MIN_TILES) return r // keep min
        return { ...r, enabled: !r.enabled }
      }),
    )
  }

  const toggleSize = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, size: r.size === '2x1' ? '1x1' : '2x1' } : r,
      ),
    )
  }

  const handleSave = async () => {
    if (!canSave) return
    const next: DashboardTile[] = rows
      .filter((r) => r.enabled)
      .map((r) =>
        r.kind === 'smart-rotating'
          ? { id: r.id, kind: 'smart-rotating' as const, size: r.size, locked: null }
          : { id: r.id, kind: 'stat' as const, size: r.size },
      )

    setSaving(true)
    setError(null)
    try {
      const token =
        typeof window !== 'undefined' ? window.localStorage?.getItem('token') : null
      const res = await fetch('/api/dashboard/layout', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ layout: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Save failed (${res.status})`)
      }
      const json = (await res.json()) as { layout?: DashboardTile[] }
      onSaved(json.layout ?? next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your layout')
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-100 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800 sm:p-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">
              Customize Dashboard
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Pick tiles, drag to reorder, and tap the size to make a tile wide.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="tiles">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-2"
                >
                  {rows.map((row, index) => (
                    <Draggable key={row.id} draggableId={row.id} index={index}>
                      {(prov, snapshot) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          className={`flex items-center gap-3 rounded-xl border bg-white p-3 dark:bg-zinc-900 ${
                            snapshot.isDragging
                              ? 'border-zinc-300 dark:border-zinc-600'
                              : 'border-zinc-200 dark:border-zinc-800'
                          } ${row.enabled ? '' : 'opacity-60'}`}
                        >
                          <span
                            {...prov.dragHandleProps}
                            aria-label="Drag to reorder"
                            className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-zinc-400 hover:text-zinc-600 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <RowBadge row={row} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                              {row.label}
                            </p>
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {row.description}
                            </p>
                          </div>

                          {/* Size toggle — only meaningful for enabled tiles */}
                          <button
                            onClick={() => toggleSize(row.id)}
                            disabled={!row.enabled}
                            aria-label={
                              row.size === '2x1'
                                ? `Make ${row.label} standard size`
                                : `Make ${row.label} wide`
                            }
                            title={row.size === '2x1' ? 'Wide' : 'Standard'}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-30 ${
                              row.size === '2x1'
                                ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                                : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500'
                            }`}
                          >
                            {row.size === '2x1' ? (
                              <RectangleHorizontal className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>

                          {/* Enable toggle */}
                          <button
                            onClick={() => toggleRow(row.id)}
                            aria-pressed={row.enabled}
                            aria-label={row.enabled ? `Disable ${row.label}` : `Enable ${row.label}`}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                              row.enabled
                                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                                : 'border-zinc-300 bg-white text-transparent hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500'
                            }`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Showing {enabledCount} {enabledCount === 1 ? 'tile' : 'tiles'} (min {MIN_TILES}).
          </p>
          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 border-t border-zinc-200 p-5 dark:border-zinc-800 sm:p-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:py-3"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 rounded-xl bg-zinc-900 py-2.5 font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 sm:py-3"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
