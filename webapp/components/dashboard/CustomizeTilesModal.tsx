"use client"

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { GripVertical, Check, X } from 'lucide-react'
import {
  ALL_TILE_IDS,
  TILE_DEFS,
  saveTilePreference,
  type DashboardTileId,
  type DashboardTileDef,
} from '@/lib/dashboardTiles'
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
const MAX_TILES = 8

interface CustomizeTilesModalProps {
  open: boolean
  selectedIds: DashboardTileId[]
  onClose: () => void
  onSave: (ids: DashboardTileId[]) => void
}

interface CustomizerBodyProps {
  selectedIds: DashboardTileId[]
  onClose: () => void
  onSave: (ids: DashboardTileId[]) => void
}

interface RowState {
  id: DashboardTileId
  enabled: boolean
}

/**
 * Build initial row state — selected tiles in their saved order, then any
 * remaining tiles appended (disabled). This way a user's enabled order is
 * preserved at the top and they can drag disabled rows in if they want.
 */
function buildInitialRows(selectedIds: DashboardTileId[]): RowState[] {
  const seen = new Set<DashboardTileId>()
  const rows: RowState[] = []
  for (const id of selectedIds) {
    if (TILE_DEFS[id] && !seen.has(id)) {
      seen.add(id)
      rows.push({ id, enabled: true })
    }
  }
  for (const id of ALL_TILE_IDS) {
    if (!seen.has(id)) {
      rows.push({ id, enabled: false })
    }
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

function IconBadge({ def }: { def: DashboardTileDef }) {
  if (def.id === 'mood') return <MoodBadge />
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

export default function CustomizeTilesModal({
  open,
  selectedIds,
  onClose,
  onSave,
}: CustomizeTilesModalProps) {
  useLockScroll(open)
  return (
    <AnimatePresence>
      {open && (
        <CustomizerBody selectedIds={selectedIds} onClose={onClose} onSave={onSave} />
      )}
    </AnimatePresence>
  )
}

/**
 * The actual customizer body — only mounted when the modal is open. This
 * keeps row state fresh: every open is a fresh mount, so initial state is
 * derived from `selectedIds` exactly once per opening (no setState-in-effect).
 */
function CustomizerBody({ selectedIds, onClose, onSave }: CustomizerBodyProps) {
  const [rows, setRows] = useState<RowState[]>(() => buildInitialRows(selectedIds))

  // Esc closes (cancel)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const enabledCount = rows.filter(r => r.enabled).length
  const canSave = enabledCount >= MIN_TILES && enabledCount <= MAX_TILES

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return
    setRows(prev => {
      const next = Array.from(prev)
      const [moved] = next.splice(result.source.index, 1)
      next.splice(result.destination!.index, 0, moved)
      return next
    })
  }

  const toggleRow = (id: DashboardTileId) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r
        // Don't let user disable below min when already at min
        if (r.enabled && enabledCount <= MIN_TILES) return r
        return { ...r, enabled: !r.enabled }
      })
    )
  }

  const handleSave = () => {
    if (!canSave) return
    const ids = rows.filter(r => r.enabled).map(r => r.id)
    saveTilePreference(ids)
    onSave(ids)
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
                  Pick which tiles show on your dashboard. Drag to reorder.
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
                      {rows.map((row, index) => {
                        const def = TILE_DEFS[row.id]
                        return (
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
                                <IconBadge def={def} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                                    {def.label}
                                  </p>
                                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                    {def.description}
                                  </p>
                                </div>
                                <button
                                  onClick={() => toggleRow(row.id)}
                                  aria-pressed={row.enabled}
                                  aria-label={row.enabled ? `Disable ${def.label}` : `Enable ${def.label}`}
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
                        )
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                {MIN_TILES}–{MAX_TILES} tiles. Currently showing {enabledCount}.
              </p>
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
                Save
              </button>
            </div>
      </motion.div>
    </motion.div>
  )
}
