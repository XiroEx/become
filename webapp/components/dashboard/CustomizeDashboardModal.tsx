"use client"

// Layout-aware dashboard customizer (v2).
//
// Shows ONLY the user's current tiles. Each row can be resized (square ⇄ wide),
// have its type changed (searchable picker), be reordered (drag), or deleted.
// An "Add tile" button opens the same searchable picker to append a new tile of
// any type. On save it PATCHes /api/dashboard/layout (cross-device source of
// truth) and hands the new layout back to the parent so the grid re-renders.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import {
  GripVertical,
  X,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  Square,
  RectangleHorizontal,
  Sparkles,
  Check,
} from 'lucide-react'
import {
  ALL_TILE_IDS,
  TILE_DEFS,
  type DashboardTileId,
} from '@/lib/dashboardTiles'
import type { DashboardTile, DashboardTileSize, DashboardTileSettings } from '@/lib/dashboardLayout/types'
import { SMART_INTERVAL_OPTIONS_MS, DEFAULT_SMART_INTERVAL_MS } from '@/lib/dashboardLayout/types'
import { SMART_ROTATING_TILE_ID, DEFAULT_SMART_POOL } from '@/lib/dashboardLayout/defaults'
import { useLockScroll } from '@/lib/useLockScroll'
import { Settings2 } from 'lucide-react'

const MAX_TILES = 20
const SMART_KEY = 'smart'

const ACCENT_BADGE_CLASSES: Record<string, string> = {
  green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

// ── Tile-type catalog (the things you can add or change a tile into) ─────────

interface TileOption {
  key: string // stable: a stat id, or SMART_KEY
  kind: 'stat' | 'smart-rotating'
  id: string
  label: string
  description: string
}

const CATALOG: TileOption[] = [
  ...ALL_TILE_IDS.map((id) => ({
    key: id,
    kind: 'stat' as const,
    id,
    label: TILE_DEFS[id].label,
    description: TILE_DEFS[id].description,
  })),
  {
    key: SMART_KEY,
    kind: 'smart-rotating' as const,
    id: SMART_ROTATING_TILE_ID,
    label: 'Smart Tile',
    description: 'Rotates through your most relevant metrics',
  },
]

// ── Row model (one per tile currently in the layout) ─────────────────────────

interface Row {
  rowId: string
  kind: 'stat' | 'smart-rotating' | 'metric'
  id: string
  size: DashboardTileSize
  /** Per-tile settings (smart tile: pool + intervalMs). */
  settings?: DashboardTileSettings
}

function optionKeyForRow(row: Row): string {
  return row.kind === 'smart-rotating' ? SMART_KEY : row.id
}

function metaForRow(row: Row): { label: string; description: string } {
  if (row.kind === 'smart-rotating') {
    return { label: 'Smart Tile', description: 'Rotates through your most relevant metrics' }
  }
  const def = TILE_DEFS[row.id as DashboardTileId]
  return def ? { label: def.label, description: def.description } : { label: row.id, description: 'Metric' }
}

function buildRows(layout: DashboardTile[]): Row[] {
  return layout.map((t, i) => ({
    rowId: `r${i}-${t.kind}-${t.id}`,
    kind: t.kind,
    id: t.id,
    size: t.size,
    settings: t.settings,
  }))
}

interface CustomizeDashboardModalProps {
  open: boolean
  layout: DashboardTile[]
  onClose: () => void
  onSaved: (layout: DashboardTile[]) => void
}

// ── Badges ───────────────────────────────────────────────────────────────────

function MoodBadge() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
      <svg viewBox="0 0 48 48" className="h-5 w-5">
        <circle cx="24" cy="24" r="22" className="fill-emerald-400" />
        <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
        <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
        <path d="M14 30 Q24 40 34 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-zinc-700 dark:text-zinc-800" />
      </svg>
    </span>
  )
}

function TileBadge({ kind, id }: { kind: Row['kind']; id: string }) {
  if (kind === 'smart-rotating') {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
        <Sparkles className="h-4 w-4" />
      </span>
    )
  }
  if (id === 'mood') return <MoodBadge />
  const def = TILE_DEFS[id as DashboardTileId]
  if (!def) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <Sparkles className="h-4 w-4" />
      </span>
    )
  }
  const Icon = def.Icon
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ACCENT_BADGE_CLASSES[def.accent] ?? ACCENT_BADGE_CLASSES.zinc}`}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

// ── Size segmented control (exactly two options) ─────────────────────────────

function SizeControl({ size, onChange }: { size: DashboardTileSize; onChange: (s: DashboardTileSize) => void }) {
  const btn = (active: boolean) =>
    `flex h-7 w-8 items-center justify-center transition-colors ${
      active
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
      <button type="button" onClick={() => onChange('1x1')} aria-pressed={size === '1x1'} aria-label="Square" title="Square" className={btn(size === '1x1')}>
        <Square className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onChange('2x1')} aria-pressed={size === '2x1'} aria-label="Wide" title="Wide" className={`border-l border-zinc-300 dark:border-zinc-700 ${btn(size === '2x1')}`}>
        <RectangleHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Searchable picker panel (used for both Add and Change-type) ───────────────

function TilePicker({
  title,
  disabledKeys,
  currentKey,
  onPick,
  onCancel,
}: {
  title: string
  /** Option keys that can't be chosen (already used elsewhere). */
  disabledKeys: Set<string>
  /** The row's own current option key (shown selected, never disabled). */
  currentKey?: string
  onPick: (opt: TileOption) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const options = CATALOG.filter(
    (o) => !q || o.label.toLowerCase().includes(q) || o.description.toLowerCase().includes(q),
  )

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onCancel} aria-label="Back" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</h3>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tiles…"
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </div>

      <div className="-mx-1 flex-1 space-y-1.5 overflow-y-auto px-1">
        {options.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">No tiles match “{query}”.</p>
        )}
        {options.map((opt) => {
          const isCurrent = opt.key === currentKey
          const disabled = !isCurrent && disabledKeys.has(opt.key)
          return (
            <button
              key={opt.key}
              disabled={disabled}
              onClick={() => onPick(opt)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                disabled
                  ? 'cursor-not-allowed border-zinc-200 opacity-40 dark:border-zinc-800'
                  : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50'
              }`}
            >
              <TileBadge kind={opt.kind} id={opt.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{opt.label}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {disabled ? 'Already on your dashboard' : opt.description}
                </p>
              </div>
              {isCurrent && <Check className="h-4 w-4 shrink-0 text-zinc-900 dark:text-white" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Smart-tile settings panel (pool picker + frequency) ──────────────────────

const FREQ_LABELS: Record<number, string> = {
  4000: 'Fast · 4s',
  6000: 'Normal · 6s',
  10000: 'Relaxed · 10s',
  30000: 'Slow · 30s',
}

/** All cards a smart tile can rotate through (stats only — the original set). */
const POOL_OPTIONS = ALL_TILE_IDS.map((id) => ({
  key: `stat:${id}`,
  label: TILE_DEFS[id].label,
  id,
}))

function SmartSettingsPanel({
  settings,
  onChange,
  onCancel,
}: {
  settings: DashboardTileSettings | undefined
  onChange: (next: DashboardTileSettings) => void
  onCancel: () => void
}) {
  // Default pool = original stats only (no workout metrics).
  const pool = new Set(settings?.pool ?? DEFAULT_SMART_POOL)
  const intervalMs = settings?.intervalMs ?? DEFAULT_SMART_INTERVAL_MS

  const togglePool = (key: string) => {
    const next = new Set(pool)
    if (next.has(key)) {
      if (next.size <= 1) return // keep at least one card
      next.delete(key)
    } else {
      next.add(key)
    }
    // Persist in POOL_OPTIONS order for stable display.
    onChange({ ...settings, pool: POOL_OPTIONS.filter((o) => next.has(o.key)).map((o) => o.key) })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onCancel} aria-label="Back" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Smart tile settings</h3>
      </div>

      <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
        {/* Frequency */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Rotation speed</p>
          <div className="grid grid-cols-2 gap-2">
            {SMART_INTERVAL_OPTIONS_MS.map((ms) => {
              const active = intervalMs === ms
              return (
                <button
                  key={ms}
                  onClick={() => onChange({ ...settings, intervalMs: ms })}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                      : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  {FREQ_LABELS[ms] ?? `${Math.round(ms / 1000)}s`}
                </button>
              )
            })}
          </div>
        </div>

        {/* Pool */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Cards to rotate through
          </p>
          <div className="space-y-1.5">
            {POOL_OPTIONS.map((o) => {
              const on = pool.has(o.key)
              return (
                <button
                  key={o.key}
                  onClick={() => togglePool(o.key)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-2.5 text-left transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  <TileBadge kind="stat" id={o.id} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-white">{o.label}</span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      on
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                        : 'border-zinc-300 text-transparent dark:border-zinc-600'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            The smart tile cycles through the selected cards (excluding ones already pinned).
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Modal shell ──────────────────────────────────────────────────────────────

export default function CustomizeDashboardModal({ open, layout, onClose, onSaved }: CustomizeDashboardModalProps) {
  useLockScroll(open)
  return (
    <AnimatePresence>
      {open && <CustomizerBody layout={layout} onClose={onClose} onSaved={onSaved} />}
    </AnimatePresence>
  )
}

type PickerState =
  | null
  | { mode: 'add' }
  | { mode: 'change'; rowId: string }
  | { mode: 'settings'; rowId: string }

function CustomizerBody({ layout, onClose, onSaved }: Omit<CustomizeDashboardModalProps, 'open'>) {
  const [rows, setRows] = useState<Row[]>(() => buildRows(layout))
  const [picker, setPicker] = useState<PickerState>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const counter = useRef(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (picker) setPicker(null)
      else onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, picker])

  const canSave = rows.length >= 1 && rows.length <= MAX_TILES && !saving

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return
    setRows((prev) => {
      const next = Array.from(prev)
      const [moved] = next.splice(result.source.index, 1)
      next.splice(result.destination!.index, 0, moved)
      return next
    })
  }

  const setSize = (rowId: string, size: DashboardTileSize) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, size } : r)))

  const setRowSettings = (rowId: string, settings: DashboardTileSettings) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, settings } : r)))

  const deleteRow = (rowId: string) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.rowId !== rowId)))

  // Option keys already in use (stat ids are unique; smart can repeat).
  const usedKeys = (exceptRowId?: string) => {
    const s = new Set<string>()
    for (const r of rows) {
      if (r.rowId === exceptRowId) continue
      if (r.kind === 'stat') s.add(r.id)
      // smart-rotating intentionally not added — duplicates allowed
    }
    return s
  }

  const handlePick = (opt: TileOption) => {
    if (!picker) return
    if (picker.mode === 'add') {
      counter.current += 1
      setRows((prev) => [...prev, { rowId: `new-${counter.current}`, kind: opt.kind, id: opt.id, size: '1x1' }])
    } else {
      setRows((prev) => prev.map((r) => (r.rowId === picker.rowId ? { ...r, kind: opt.kind, id: opt.id } : r)))
    }
    setPicker(null)
  }

  const handleSave = async () => {
    if (!canSave) return
    const next: DashboardTile[] = rows.map((r) => {
      if (r.kind === 'smart-rotating') {
        const tile: DashboardTile = { id: r.id, kind: 'smart-rotating', size: r.size, locked: null }
        if (r.settings && (r.settings.pool?.length || r.settings.intervalMs)) {
          tile.settings = r.settings
        }
        return tile
      }
      return { id: r.id, kind: r.kind, size: r.size }
    })
    setSaving(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? window.localStorage?.getItem('token') : null
      const res = await fetch('/api/dashboard/layout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

  const changingRow = picker?.mode === 'change' ? rows.find((r) => r.rowId === picker.rowId) : undefined
  const settingsRow = picker?.mode === 'settings' ? rows.find((r) => r.rowId === picker.rowId) : undefined

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
        className="relative flex h-[80dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800 sm:p-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">Customize Dashboard</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Resize, reorder, swap, or remove your tiles — and add new ones.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {picker?.mode === 'settings' && settingsRow ? (
            <SmartSettingsPanel
              settings={settingsRow.settings}
              onChange={(next) => setRowSettings(settingsRow.rowId, next)}
              onCancel={() => setPicker(null)}
            />
          ) : picker && picker.mode !== 'settings' ? (
            <TilePicker
              title={picker.mode === 'add' ? 'Add a tile' : 'Change tile'}
              disabledKeys={usedKeys(picker.mode === 'change' ? picker.rowId : undefined)}
              currentKey={changingRow ? optionKeyForRow(changingRow) : undefined}
              onPick={handlePick}
              onCancel={() => setPicker(null)}
            />
          ) : (
            <>
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="tiles">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                      {rows.map((row, index) => {
                        const meta = metaForRow(row)
                        return (
                          <Draggable key={row.rowId} draggableId={row.rowId} index={index}>
                            {(prov, snapshot) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                className={`flex items-center gap-2.5 rounded-xl border bg-white p-3 dark:bg-zinc-900 ${
                                  snapshot.isDragging ? 'border-zinc-300 dark:border-zinc-600' : 'border-zinc-200 dark:border-zinc-800'
                                }`}
                              >
                                <span {...prov.dragHandleProps} aria-label="Drag to reorder" className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-zinc-400 hover:text-zinc-600 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400">
                                  <GripVertical className="h-4 w-4" />
                                </span>
                                <TileBadge kind={row.kind} id={row.id} />
                                <button
                                  onClick={() => setPicker({ mode: 'change', rowId: row.rowId })}
                                  className="min-w-0 flex-1 text-left"
                                  title="Change tile type"
                                >
                                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{meta.label}</p>
                                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">Tap to change</p>
                                </button>
                                <SizeControl size={row.size} onChange={(s) => setSize(row.rowId, s)} />
                                {row.kind === 'smart-rotating' && (
                                  <button
                                    onClick={() => setPicker({ mode: 'settings', rowId: row.rowId })}
                                    aria-label="Smart tile settings"
                                    title="Settings"
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                  >
                                    <Settings2 className="h-4 w-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteRow(row.rowId)}
                                  disabled={rows.length <= 1}
                                  aria-label={`Remove ${meta.label}`}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4" />
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

              <button
                onClick={() => setPicker({ mode: 'add' })}
                disabled={rows.length >= MAX_TILES}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-semibold text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50"
              >
                <Plus className="h-4 w-4" />
                Add tile
              </button>

              {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
            </>
          )}
        </div>

        {/* Footer actions (hidden while the picker is open) */}
        {!picker && (
          <div className="flex shrink-0 gap-3 border-t border-zinc-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] dark:border-zinc-800 sm:p-6">
            <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-200 py-2.5 font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:py-3">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!canSave} className="flex-1 rounded-xl bg-zinc-900 py-2.5 font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 sm:py-3">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
