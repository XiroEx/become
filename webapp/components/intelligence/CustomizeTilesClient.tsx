'use client'

import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import type { Metric, MetricDomain } from '@/lib/metrics/types'

export interface MetricSummary {
  id: string
  label: string
  unit: string
  domain: MetricDomain
}

export interface CustomizeTilesClientProps {
  availableMetrics: MetricSummary[]
  initialPinned: string[]
  /** Inject for testing — bypasses fetch. */
  onPersist?: (pinnedTiles: string[]) => Promise<void> | void
}

const DOMAIN_LABELS: Record<MetricDomain, string> = {
  workout: 'Workout',
  nutrition: 'Nutrition',
  mindset: 'Mindset',
}

async function defaultPersist(pinnedTiles: string[]): Promise<void> {
  const token =
    typeof window !== 'undefined' ? window.localStorage?.getItem('token') : null
  const res = await fetch('/api/dashboard/pinned-tiles', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ pinnedTiles }),
  })
  if (!res.ok) {
    throw new Error(`PATCH /api/dashboard/pinned-tiles failed: ${res.status}`)
  }
}

export function metricsToSummary(metrics: Metric[]): MetricSummary[] {
  return metrics.map((m) => ({
    id: m.id,
    label: m.label,
    unit: m.unit,
    domain: m.domain,
  }))
}

export function groupByDomain(
  metrics: MetricSummary[],
): Record<MetricDomain, MetricSummary[]> {
  const out: Record<MetricDomain, MetricSummary[]> = {
    workout: [],
    nutrition: [],
    mindset: [],
  }
  for (const m of metrics) out[m.domain].push(m)
  for (const k of Object.keys(out) as MetricDomain[]) {
    out[k].sort((a, b) => a.label.localeCompare(b.label))
  }
  return out
}

export function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr.slice()
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function CustomizeTilesClient({
  availableMetrics,
  initialPinned,
  onPersist,
}: CustomizeTilesClientProps) {
  const [pinned, setPinned] = useState<string[]>(initialPinned)
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const persist = onPersist ?? defaultPersist
  const grouped = groupByDomain(availableMetrics)
  const pinnedMetrics = pinned
    .map((id) => availableMetrics.find((m) => m.id === id))
    .filter((m): m is MetricSummary => !!m)

  async function commit(next: string[]) {
    setPinned(next)
    setSavingState('saving')
    try {
      await persist(next)
      setSavingState('saved')
    } catch (err) {
      console.error('CustomizeTilesClient: persist failed', err)
      setSavingState('error')
    }
  }

  function togglePin(id: string) {
    const next = pinned.includes(id)
      ? pinned.filter((p) => p !== id)
      : [...pinned, id]
    void commit(next)
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const from = result.source.index
    const to = result.destination.index
    const next = moveInArray(pinned, from, to)
    void commit(next)
  }

  return (
    <div data-testid="customize-tiles" className="space-y-6">
      <section data-testid="pinned-section">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Pinned ({pinnedMetrics.length})
        </h2>
        {pinnedMetrics.length === 0 ? (
          <p data-testid="pinned-empty" className="text-xs text-zinc-500">
            No pinned tiles yet — toggle one below.
          </p>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="pinned-list">
              {(provided) => (
                <ul
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  data-testid="pinned-list"
                  className="space-y-1"
                >
                  {pinnedMetrics.map((m, i) => (
                    <Draggable key={m.id} draggableId={m.id} index={i}>
                      {(p) => (
                        <li
                          ref={p.innerRef}
                          {...p.draggableProps}
                          {...p.dragHandleProps}
                          data-testid="pinned-item"
                          data-metric-id={m.id}
                          data-index={i}
                          className="flex items-center justify-between rounded-lg bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 ring-1 ring-white/10"
                        >
                          <span>{m.label}</span>
                          <button
                            type="button"
                            onClick={() => togglePin(m.id)}
                            data-testid="unpin-button"
                            aria-label={`Unpin ${m.label}`}
                            className="text-xs text-zinc-400 hover:text-zinc-100"
                          >
                            Unpin
                          </button>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </section>

      {(Object.keys(grouped) as MetricDomain[]).map((domain) => (
        <section key={domain} data-testid={`domain-${domain}`}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {DOMAIN_LABELS[domain]}
          </h2>
          {grouped[domain].length === 0 ? (
            <p className="text-xs text-zinc-500">No tiles yet in this domain.</p>
          ) : (
            <ul className="space-y-1">
              {grouped[domain].map((m) => {
                const isPinned = pinned.includes(m.id)
                return (
                  <li
                    key={m.id}
                    data-testid="domain-item"
                    data-metric-id={m.id}
                    data-pinned={isPinned}
                    className="flex items-center justify-between rounded-lg bg-zinc-900/40 px-3 py-2 text-sm text-zinc-200"
                  >
                    <span>
                      {m.label}{' '}
                      <span className="text-xs text-zinc-500">({m.unit})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePin(m.id)}
                      data-testid="pin-toggle"
                      aria-pressed={isPinned}
                      className="rounded-full px-3 py-1 text-xs font-medium"
                      style={{
                        background: isPinned ? '#10b981' : '#3f3f46',
                        color: isPinned ? '#022c22' : '#e4e4e7',
                      }}
                    >
                      {isPinned ? 'Pinned' : 'Pin'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}

      <p data-testid="save-status" className="text-xs text-zinc-500">
        {savingState === 'saving' && 'Saving…'}
        {savingState === 'saved' && 'Saved.'}
        {savingState === 'error' && 'Save failed — try again.'}
      </p>
    </div>
  )
}
