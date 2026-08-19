'use client'

// The weight line on the Becoming's Fuel screen.
//
//   Week      this week, Sunday → Saturday, every day on the axis
//   All time  every weigh-in, labelled by month
//
// Numbers up the left, days (or months) along the bottom, the goal as a dashed
// line, and a drag/hover readout that names the exact day and weight — the
// same reading as the dashboard chart, in the stage's dark language.

import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { buildWeightSeries, weightCaption, longDayLabel, type WeighIn, type WeightView, type ChartPoint } from '@/lib/becoming/weightSeries'
import { PILLAR } from '@/lib/pillarColors'

const W = 320, H = 132
const L = 30, R = 8, T = 12, B = 22   // room for the y numbers and the day labels

export default function WeightChart({
  weighIns, target, unit, todayKey, direction,
}: {
  weighIns: WeighIn[]
  target: number | null
  unit: 'lbs' | 'kg'
  todayKey: string
  direction: 'lose' | 'maintain' | 'gain' | null
}) {
  const [view, setView] = useState<WeightView>('week')
  const [hover, setHover] = useState<ChartPoint | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const s = useMemo(() => buildWeightSeries(weighIns, view, target, todayKey), [weighIns, view, target, todayKey])

  const px = (x: number) => L + x * (W - L - R)
  const py = (y: number) => T + y * (H - T - B)
  const line = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ')
  const area = s.points.length > 1
    ? `${line} L ${px(s.points[s.points.length - 1].x).toFixed(1)} ${H - B} L ${px(s.points[0].x).toFixed(1)} ${H - B} Z`
    : null
  const hue = PILLAR.fuel.hex
  const good = direction === 'lose' ? (s.delta ?? 0) < 0 : direction === 'gain' ? (s.delta ?? 0) > 0 : Math.abs(s.delta ?? 0) < 1

  // Nearest point to the pointer, in chart space.
  const pick = (clientX: number) => {
    const el = svgRef.current; if (!el || s.points.length === 0) return
    const r = el.getBoundingClientRect()
    const x = ((clientX - r.left) / r.width) * W
    let best = s.points[0], bd = Infinity
    for (const p of s.points) { const d = Math.abs(px(p.x) - x); if (d < bd) { bd = d; best = p } }
    setHover(best)
  }

  return (
    <div data-testid="weight-chart">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Weight</p>
        <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-0.5 ring-1 ring-white/10">
          {(['week', 'all'] as WeightView[]).map(v => (
            <button
              key={v}
              type="button"
              data-testid={`weight-view-${v}`}
              aria-pressed={view === v}
              onClick={() => { setView(v); setHover(null) }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${view === v ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white/80'}`}
            >
              {v === 'week' ? 'Week' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      {s.points.length === 0 ? (
        <p className="rounded-xl bg-white/[0.04] px-3 py-6 text-center text-xs text-white/50">
          {view === 'week' ? 'No weigh-ins yet this week — step on the scale and the line starts.' : 'Log a weigh-in and your line starts here.'}
        </p>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" style={{ height: H }}
            role="img" aria-label={`Weight, ${weightCaption(s, unit)}`}
            onPointerDown={e => pick(e.clientX)}
            onPointerMove={e => { if (e.buttons > 0 || e.pointerType === 'mouse') pick(e.clientX) }}
            onPointerLeave={() => setHover(null)}
            onPointerUp={() => { /* keep the readout after a tap */ }}
          >
            <defs>
              <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={hue} stopOpacity="0.3" />
                <stop offset="1" stopColor={hue} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Gridlines + the numbers up the side */}
            {s.yTicks.map(t => (
              <g key={t.label}>
                <line x1={L} x2={W - R} y1={py(t.y ?? 0)} y2={py(t.y ?? 0)} stroke="white" strokeOpacity={0.07} strokeWidth={1} />
                <text x={L - 6} y={py(t.y ?? 0) + 3} textAnchor="end" fontSize="9" fill="white" fillOpacity={0.45}>{t.label}</text>
              </g>
            ))}

            {/* The goal */}
            {s.targetY != null && (
              <>
                <line x1={L} x2={W - R} y1={py(s.targetY)} y2={py(s.targetY)} stroke="#34d399" strokeOpacity={0.8} strokeWidth={1.5} strokeDasharray="5 5" />
                <text x={W - R} y={py(s.targetY) - 4} textAnchor="end" fontSize="9" fontWeight={600} fill="#34d399" fillOpacity={0.95}>goal {Math.round(s.target as number)}</text>
              </>
            )}

            {area && <path d={area} fill="url(#weight-fill)" />}
            <motion.path d={line} fill="none" stroke={hue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />

            {/* A dot per weigh-in in the week view; just the ends all-time */}
            {(view === 'week' ? s.points : [s.points[0], s.points[s.points.length - 1]]).map((p, i) => p && (
              <circle key={`${p.day}-${i}`} cx={px(p.x)} cy={py(p.y)} r={3} fill="#0e0c17" stroke={hue} strokeWidth={2} />
            ))}
            <circle cx={px(s.points[s.points.length - 1].x)} cy={py(s.points[s.points.length - 1].y)} r={4.5} fill={hue} stroke="#0e0c17" strokeWidth={2} />

            {/* Hover / drag readout */}
            {hover && (
              <g>
                <line x1={px(hover.x)} x2={px(hover.x)} y1={T} y2={H - B} stroke="white" strokeOpacity={0.25} strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={px(hover.x)} cy={py(hover.y)} r={5} fill={hue} stroke="#0e0c17" strokeWidth={2} />
              </g>
            )}

            {/* Days along the bottom */}
            {s.xTicks.map((t, i) => (
              <text key={`${t.label}-${i}`} x={px(t.x ?? 0)} y={H - 6} textAnchor="middle" fontSize="9" fill="white"
                fillOpacity={hover && Math.abs((t.x ?? 0) - hover.x) < 0.01 ? 0.9 : 0.45} fontWeight={hover && Math.abs((t.x ?? 0) - hover.x) < 0.01 ? 700 : 500}>
                {t.label}
              </text>
            ))}
          </svg>

          <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px]" data-testid="weight-caption">
            {hover ? (
              <span className="font-semibold text-white">{longDayLabel(hover.day)} · {hover.value.toFixed(1)} {unit}</span>
            ) : (
              <>
                <span className="text-white/50">{s.first ? `${s.first.label} · ${Math.round(s.first.value)} ${unit}` : ''}</span>
                <span className={good ? 'font-semibold text-emerald-400' : 'text-white/70'}>{weightCaption(s, unit)}</span>
                <span className="text-white/50">{Math.round(s.last?.value ?? 0)} {unit} · now</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
