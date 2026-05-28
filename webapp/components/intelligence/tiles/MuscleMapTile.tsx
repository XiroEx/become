// Front/back anatomical SVG overlay tile. Async server component.
//
// Data shape: DataPoint[] where label = muscle slug and value = intensity
// in [0, 1]. Unknown slugs are silently ignored. Muscles not present in the
// data render at base/neutral fill. Each region exposes its slug + intensity
// via aria-label and data-* attrs for inspection.

import { useMetricData } from '@/lib/metrics/useMetricData'
import type { DataPoint, MetricWindow } from '@/lib/metrics/types'
import { TileShell, TileShellError } from './TileShell'

export interface MuscleMapTileProps {
  metricId: string
  window: MetricWindow
  className?: string
}

interface MuscleRegion {
  slug: string
  label: string
  side: 'front' | 'back'
  // Simple rect coordinates within a 100×200 unit silhouette.
  x: number
  y: number
  w: number
  h: number
  rx?: number
}

// Minimal anatomical map. Coordinates are in a 100×200 viewBox per side.
export const MUSCLE_REGIONS: MuscleRegion[] = [
  // Front
  { slug: 'shoulders-front', label: 'Front delts', side: 'front', x: 18, y: 50, w: 18, h: 14, rx: 4 },
  { slug: 'shoulders-front-r', label: 'Front delts', side: 'front', x: 64, y: 50, w: 18, h: 14, rx: 4 },
  { slug: 'chest', label: 'Chest', side: 'front', x: 30, y: 60, w: 40, h: 22, rx: 6 },
  { slug: 'biceps-l', label: 'Biceps', side: 'front', x: 14, y: 75, w: 14, h: 28, rx: 5 },
  { slug: 'biceps-r', label: 'Biceps', side: 'front', x: 72, y: 75, w: 14, h: 28, rx: 5 },
  { slug: 'abs', label: 'Abs', side: 'front', x: 36, y: 86, w: 28, h: 34, rx: 4 },
  { slug: 'quads-l', label: 'Quads', side: 'front', x: 28, y: 122, w: 18, h: 50, rx: 6 },
  { slug: 'quads-r', label: 'Quads', side: 'front', x: 54, y: 122, w: 18, h: 50, rx: 6 },
  { slug: 'calves-front-l', label: 'Calves', side: 'front', x: 30, y: 174, w: 14, h: 20, rx: 4 },
  { slug: 'calves-front-r', label: 'Calves', side: 'front', x: 56, y: 174, w: 14, h: 20, rx: 4 },
  // Back
  { slug: 'traps', label: 'Traps', side: 'back', x: 38, y: 40, w: 24, h: 16, rx: 5 },
  { slug: 'rear-delts-l', label: 'Rear delts', side: 'back', x: 18, y: 50, w: 16, h: 14, rx: 4 },
  { slug: 'rear-delts-r', label: 'Rear delts', side: 'back', x: 66, y: 50, w: 16, h: 14, rx: 4 },
  { slug: 'lats', label: 'Lats', side: 'back', x: 26, y: 60, w: 48, h: 30, rx: 8 },
  { slug: 'triceps-l', label: 'Triceps', side: 'back', x: 14, y: 75, w: 14, h: 28, rx: 5 },
  { slug: 'triceps-r', label: 'Triceps', side: 'back', x: 72, y: 75, w: 14, h: 28, rx: 5 },
  { slug: 'lower-back', label: 'Lower back', side: 'back', x: 36, y: 92, w: 28, h: 20, rx: 4 },
  { slug: 'glutes', label: 'Glutes', side: 'back', x: 30, y: 116, w: 40, h: 22, rx: 8 },
  { slug: 'hamstrings-l', label: 'Hamstrings', side: 'back', x: 28, y: 138, w: 18, h: 34, rx: 6 },
  { slug: 'hamstrings-r', label: 'Hamstrings', side: 'back', x: 54, y: 138, w: 18, h: 34, rx: 6 },
  { slug: 'calves-back-l', label: 'Calves', side: 'back', x: 30, y: 174, w: 14, h: 20, rx: 4 },
  { slug: 'calves-back-r', label: 'Calves', side: 'back', x: 56, y: 174, w: 14, h: 20, rx: 4 },
]

// Intensity (0..1) → fill color. 0 = neutral zinc, 1 = emerald-300.
export function fillForIntensity(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity))
  if (clamped === 0) return '#3f3f46' // zinc-700
  if (clamped < 0.25) return '#065f46' // emerald-800
  if (clamped < 0.5) return '#047857' // emerald-700
  if (clamped < 0.75) return '#10b981' // emerald-500
  return '#6ee7b7' // emerald-300
}

export function buildMuscleIntensities(
  data: DataPoint[],
): Map<string, number> {
  // Multiple points per slug → max intensity wins.
  const out = new Map<string, number>()
  for (const p of data) {
    if (!p.label) continue
    const prev = out.get(p.label) ?? 0
    if (p.value > prev) out.set(p.label, p.value)
  }
  return out
}

function Silhouette({
  side,
  intensities,
}: {
  side: 'front' | 'back'
  intensities: Map<string, number>
}) {
  const regions = MUSCLE_REGIONS.filter((r) => r.side === side)
  return (
    <svg
      viewBox="0 0 100 200"
      data-testid={`muscle-map-${side}`}
      role="group"
      aria-label={`${side} view`}
      className="h-32 w-16"
    >
      <ellipse cx="50" cy="20" rx="14" ry="16" fill="#27272a" />
      <rect x="36" y="34" width="28" height="10" rx="3" fill="#27272a" />
      <rect x="10" y="44" width="80" height="120" rx="14" fill="#18181b" />
      <rect x="22" y="160" width="56" height="38" rx="10" fill="#18181b" />
      {regions.map((r) => {
        const intensity = intensities.get(r.slug) ?? 0
        return (
          <rect
            key={r.slug}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={r.rx ?? 0}
            fill={fillForIntensity(intensity)}
            data-muscle-slug={r.slug}
            data-intensity={intensity.toFixed(2)}
            aria-label={`${r.label} (${r.slug}): ${intensity.toFixed(2)} intensity`}
            role="img"
          />
        )
      })}
    </svg>
  )
}

export async function MuscleMapTile({
  metricId,
  window,
  className,
}: MuscleMapTileProps) {
  const r = await useMetricData(metricId, window)
  if (r.status === 'error') {
    return (
      <TileShellError
        message={r.error}
        metricId={metricId}
        className={className}
      />
    )
  }
  const intensities = buildMuscleIntensities(r.data)
  const litCount = intensities.size
  return (
    <TileShell
      metric={r.metric}
      latest={r.latest}
      trend={r.trend}
      className={className}
    >
      <div
        data-testid="muscle-map-body"
        data-lit-muscles={litCount}
        className="flex items-center justify-around gap-3"
      >
        <Silhouette side="front" intensities={intensities} />
        <Silhouette side="back" intensities={intensities} />
      </div>
      {litCount === 0 && (
        <div
          data-testid="muscle-map-empty"
          className="mt-2 text-center text-[10px] text-zinc-500"
        >
          no muscle activity in this window
        </div>
      )}
    </TileShell>
  )
}
