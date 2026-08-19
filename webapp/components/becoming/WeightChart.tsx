'use client'

// The weight line on the Becoming's Fuel screen: where you started, where you
// are, and the target you are heading for — all time, or week by week.
//
// Hand-drawn SVG rather than the app's chart library: this lives on the dark
// stage, needs a dashed target line and start/now markers, and has to stay
// light enough to sit inside a sheet that also animates.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { buildWeightSeries, weightCaption, type WeekWeight, type WeightPoint, type WeightView } from '@/lib/becoming/weightSeries'
import { PILLAR } from '@/lib/pillarColors'

const W = 320, H = 108, PAD_X = 6, PAD_Y = 10

export default function WeightChart({
  history, weeks, target, unit, direction,
}: {
  history: WeightPoint[]
  weeks: WeekWeight[]
  target: number | null
  unit: 'lbs' | 'kg'
  direction: 'lose' | 'maintain' | 'gain' | null
}) {
  const [view, setView] = useState<WeightView>('all')
  const s = useMemo(() => buildWeightSeries(history, weeks, view, target), [history, weeks, view, target])

  const x = (v: number) => PAD_X + v * (W - PAD_X * 2)
  const y = (v: number) => PAD_Y + v * (H - PAD_Y * 2)
  const line = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ')
  const area = s.points.length > 1
    ? `${line} L ${x(1).toFixed(1)} ${H - PAD_Y} L ${x(0).toFixed(1)} ${H - PAD_Y} Z`
    : null
  const hue = PILLAR.fuel.hex
  const good = direction === 'lose' ? (s.delta ?? 0) < 0 : direction === 'gain' ? (s.delta ?? 0) > 0 : Math.abs(s.delta ?? 0) < 1

  return (
    <div data-testid="weight-chart">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Weight</p>
        <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-0.5 ring-1 ring-white/10">
          {(['all', 'weeks'] as WeightView[]).map(v => (
            <button
              key={v}
              type="button"
              data-testid={`weight-view-${v}`}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${view === v ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white/80'}`}
            >
              {v === 'all' ? 'All time' : 'By week'}
            </button>
          ))}
        </div>
      </div>

      {s.points.length === 0 ? (
        <p className="rounded-xl bg-white/[0.04] px-3 py-6 text-center text-xs text-white/50">Log a weigh-in and your line starts here.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={`Weight ${weightCaption(s, unit)}`}>
            <defs>
              <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={hue} stopOpacity="0.28" />
                <stop offset="1" stopColor={hue} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Target line — where the plan is heading */}
            {s.targetY != null && (
              <>
                <line x1={PAD_X} x2={W - PAD_X} y1={y(s.targetY)} y2={y(s.targetY)} stroke="#34d399" strokeOpacity={0.75} strokeWidth={1.5} strokeDasharray="5 5" />
                <text x={W - PAD_X} y={y(s.targetY) - 5} textAnchor="end" fontSize="10" fontWeight={600} fill="#34d399" fillOpacity={0.9}>
                  goal {Math.round(s.target as number)}
                </text>
              </>
            )}
            {area && <path d={area} fill="url(#weight-fill)" />}
            <motion.path
              d={line} fill="none" stroke={hue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
            {/* Start and now */}
            {s.points.length > 1 && <circle cx={x(s.points[0].x)} cy={y(s.points[0].y)} r={3.5} fill="#0e0c17" stroke={hue} strokeWidth={2} />}
            <circle cx={x(s.points[s.points.length - 1].x)} cy={y(s.points[s.points.length - 1].y)} r={4.5} fill={hue} stroke="#0e0c17" strokeWidth={2} />
          </svg>

          <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-white/50">{s.first?.label} · {Math.round(s.first?.value ?? 0)} {unit}</span>
            <span className={good ? 'font-semibold text-emerald-400' : 'text-white/70'}>{weightCaption(s, unit)}</span>
            <span className="text-white/50">{Math.round(s.last?.value ?? 0)} {unit} · now</span>
          </div>
        </>
      )}
    </div>
  )
}
