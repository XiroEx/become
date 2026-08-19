'use client'

// One week of The Becoming, as a card in world space. Pure presentation:
// the canvas decides where it sits, how big it is and how blurred; this
// decides what it says.
//
//   • colour = what the week was ABOUT (training ember, fuel honey, mind
//     iris, all three verdigris, empty fog); saturation = how consistent
//   • the proof strip: Sun→Sat dots per pillar — what actually happened
//   • the member's own words (banked wins, identity) set in a serif italic
//   • the Horizon variant: one step past the live week — where this week is
//     trending, and who you said you are becoming

import { memo } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowRight, ArrowDownRight, Flag, Brain, UtensilsCrossed, Dumbbell, Sparkles, Trophy, ChevronRight, Compass } from 'lucide-react'
import type { WeekSnapshot } from '@/lib/becoming/weeks'
import { PILLAR, pillarColor } from '@/lib/pillarColors'

// The pillar palette lives in lib/pillarColors so the journey, the details, the
// streaks page and the dashboard tiles cannot drift apart.
export { PILLAR as SUBJECT } from '@/lib/pillarColors'
export { pillarColor as weekColor } from '@/lib/pillarColors'

function Strip({ days, pick, tone }: { days: WeekSnapshot['days']; pick: (d: WeekSnapshot['days'][number]) => boolean; tone: string }) {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden="true">
      {days.map(d => (
        <span
          key={d.key}
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: pick(d) ? tone : 'rgba(255,255,255,0.14)', outline: d.future ? '1px dashed rgba(255,255,255,0.35)' : undefined, outlineOffset: -1, opacity: d.future && !pick(d) ? 0.5 : 1 }}
        />
      ))}
    </span>
  )
}

const stagger = (i: number) => ({ delay: 0.06 * i, duration: 0.42, ease: [0.16, 1, 0.3, 1] as const })

export interface WeekCardProps {
  week: WeekSnapshot
  unit: 'lbs' | 'kg'
  width: number
  height: number
  focused: boolean
  /** Landing animation plays when this becomes true (after the camera settles). */
  landed: boolean
  /** True in overview — content collapses to what reads at 20% scale. */
  compact: boolean
  /** Which edge faces the next card — an edge light hints the way forward. */
  exitEdge: 'up' | 'right' | 'down' | null
  totalWeeks: number
  identity: string | null
  next?: { nutrition: { title: string }; training: { title: string } } | null
  onDetails?: () => void
  reduced?: boolean
  /** This week set a new high on the path. */
  isPeak?: boolean
  /** The whole path in miniature (top-right of the card) — tap to zoom out. */
  spark?: { altitudes: number[]; at: number }
  onSparkline?: () => void
}

function Sparkline({ altitudes, at, color, onClick }: { altitudes: number[]; at: number; color: string; onClick?: () => void }) {
  const W = 56, H = 22
  const max = Math.max(1, ...altitudes)
  const n = Math.max(1, altitudes.length - 1)
  const pts = altitudes.map((a, i) => `${(i / n) * W},${H - 3 - (a / max) * (H - 6)}`).join(' ')
  const cx = (at / n) * W, cy = H - 3 - ((altitudes[at] ?? 0) / max) * (H - 6)
  return (
    <button type="button" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onClick?.() }} aria-label="See your whole line" data-testid="week-card-spark" className="pointer-events-auto rounded-md p-1 hover:bg-white/10">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={cx} cy={cy} r={2.6} fill={color} />
      </svg>
    </button>
  )
}

function WeekCardImpl({ week: w, unit, width, height, focused, landed, compact, exitEdge, totalWeeks, identity, next, onDetails, reduced, isPeak, spark, onSparkline }: WeekCardProps) {
  const subj = PILLAR[w.subject]
  const tone = pillarColor(w.subject, w.score, 62)
  const toneSoft = pillarColor(w.subject, w.score, 60, 0.18)
  const StepIcon = w.step === 'up' ? ArrowUpRight : w.step === 'down' ? ArrowDownRight : w.step === 'start' ? Flag : ArrowRight
  const stepText = w.gap ? 'held' : isPeak ? 'new high' : w.step === 'up' ? 'climbed' : w.step === 'flat' ? 'held' : w.step === 'down' ? 'a dip' : 'start'
  const wins = w.mind.wins.slice(0, 2)
  const dominant = w.mind.dominant
  const shell = 'relative overflow-hidden rounded-[28px] text-white'
  const shadow = focused ? '0 30px 80px -20px rgba(0,0,0,0.7)' : '0 18px 40px -20px rgba(0,0,0,0.5)'
  const anim = (i: number) => (reduced || compact ? {} : { initial: { opacity: 0, y: 12 }, animate: landed ? { opacity: 1, y: 0 } : { opacity: 0.001, y: 12 }, transition: stagger(i) })

  if (compact) {
    // ── Overview tile: colour + week + one line ──
    return (
      <div className={shell} style={{ width, height, background: `linear-gradient(160deg, ${pillarColor(w.subject, w.score, 48)} 0%, ${pillarColor(w.subject, w.score, 30)} 100%)`, boxShadow: `${shadow}, inset 0 0 0 1px rgba(255,255,255,0.15)` }} data-week-index={w.index}>
        <div className="flex h-full flex-col justify-between p-7">
          <div>
            <p className="text-[40px] font-black leading-none tracking-tight">{w.gap ? '…' : `W${w.index + 1}`}</p>
            <p className="mt-2 text-xl font-semibold text-white/85">{w.label}</p>
          </div>
          <div>
            <p className="text-[26px] font-extrabold leading-tight">{w.headline}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1.5 text-lg font-bold text-white"><StepIcon className="h-5 w-5" />{w.isCurrent ? 'now' : stepText}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={shell}
      style={{ width, height, background: '#0e0c17', boxShadow: `${shadow}, inset 0 0 0 ${w.isCurrent ? 2 : 1}px ${w.isCurrent ? pillarColor(w.subject, w.score, 65, 0.9) : toneSoft}` }}
      data-week-index={w.index}
      data-testid={w.isCurrent ? 'week-card-current' : undefined}
    >
      {/* Sky: tinted by the subject; the "sun" sits high on a climb, low on a dip */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(90% 60% at ${w.step === 'down' ? '80% 100%' : w.step === 'up' ? '75% 0%' : '90% 40%'}, ${pillarColor(w.subject, w.score, 55, 0.35)}, transparent 60%), linear-gradient(160deg, ${pillarColor(w.subject, w.score, 40, 0.28)} 0%, rgba(14,12,23,0) 55%)` }} />
      {/* Edge light toward the next card */}
      {focused && exitEdge && (
        <div
          className={`pointer-events-none absolute animate-pulse ${exitEdge === 'up' ? 'inset-x-10 top-0 h-[3px]' : exitEdge === 'down' ? 'inset-x-10 bottom-0 h-[3px]' : 'inset-y-10 right-0 w-[3px]'}`}
          style={{ background: tone, boxShadow: `0 0 18px 4px ${pillarColor(w.subject, w.score, 60, 0.6)}`, borderRadius: 3 }}
          data-testid="week-card-exit"
        />
      )}

      <div className="relative flex h-full flex-col p-5">
        {/* Eyebrow */}
        <motion.div className="flex items-start justify-between gap-2" {...anim(0)}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
              {w.gap ? 'Away' : w.isCurrent ? `This week · day ${w.daysElapsed} of 7` : `Week ${w.index + 1} of ${totalWeeks}`}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white/85">{w.label}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {spark && focused && <Sparkline altitudes={spark.altitudes} at={spark.at} color={tone} onClick={onSparkline} />}
            {w.isCurrent ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/85">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: isPeak ? 'rgba(255,211,122,0.22)' : toneSoft, color: isPeak ? '#ffd37a' : 'white' }}>
                <StepIcon className="h-3.5 w-3.5" />{stepText}
              </span>
            )}
          </div>
        </motion.div>

        {/* Story */}
        <motion.h2 className="mt-4 text-[27px] font-black leading-[1.05] tracking-tight" {...anim(1)}>{w.headline}</motion.h2>
        <motion.p className="mt-2 text-[13px] leading-snug text-white/70" {...anim(2)}>{w.sub}</motion.p>

        {/* Proof strip */}
        {!w.gap && (
          <motion.div className="mt-4 space-y-2 rounded-2xl bg-white/[0.06] p-3" {...anim(3)}>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-1.5 text-white/80"><Brain className="h-3.5 w-3.5 text-violet-300" /> Mind</span>
              <span className="flex items-center gap-2 text-white/60">
                <Strip days={w.days} pick={d => d.mind} tone={PILLAR.mind.hex} />
                <span className="tabular-nums">{w.mind.sessions}s · {w.mind.moodDays}m{dominant ? ` · ${dominant.replace('_', ' ')}` : ''}</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-1.5 text-white/80"><UtensilsCrossed className="h-3.5 w-3.5 text-amber-300" /> Fuel</span>
              <span className="flex items-center gap-2 text-white/60">
                <Strip days={w.days} pick={d => d.food} tone={PILLAR.fuel.hex} />
                <span className="tabular-nums">{w.nutrition.logDays}/{w.isCurrent ? w.daysElapsed : 7}{w.nutrition.delta != null && w.nutrition.delta !== 0 ? ` · ${w.nutrition.delta > 0 ? '+' : ''}${w.nutrition.delta} ${unit}` : ''}</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-1.5 text-white/80"><Dumbbell className="h-3.5 w-3.5 text-orange-300" /> Training</span>
              <span className="flex items-center gap-2 text-white/60">
                <Strip days={w.days} pick={d => d.workout} tone={PILLAR.training.hex} />
                <span className="tabular-nums">{w.training.workouts}{w.training.target ? `/${w.training.target}` : ''}{w.training.prs.length ? ` · ${w.training.prs.length} PR${w.training.prs.length === 1 ? '' : 's'}` : ''}</span>
              </span>
            </div>
          </motion.div>
        )}

        {/* Evidence / PRs — the member's own words in serif */}
        {(wins.length > 0 || w.training.prs.length > 0) && (
          <motion.div className="mt-3 space-y-1.5" {...anim(4)}>
            {w.training.prs.slice(0, wins.length ? 1 : 2).map(p => (
              <p key={p.name} className="flex items-center gap-1.5 truncate text-[12px] text-white/75"><Trophy className="h-3.5 w-3.5 shrink-0 text-amber-300" />{p.name} · {p.e1RM}</p>
            ))}
            {wins.map((win, i) => (
              <p key={i} className="flex items-start gap-1.5 font-serif text-[14px] italic leading-snug text-white/80"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" /><span className="line-clamp-2">“{win}”</span></p>
            ))}
          </motion.div>
        )}

        <div className="flex-1" />

        {/* Live week: what writes this card */}
        {w.isCurrent && next && (
          <motion.div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3" {...anim(5)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">What writes this card</p>
            <p className="mt-1 truncate text-[12px] text-white/85">🍽 {next.nutrition.title}</p>
            <p className="truncate text-[12px] text-white/85">🏋️ {next.training.title}</p>
          </motion.div>
        )}
        {/* Identity whisper */}
        <motion.div className="mt-2 flex items-end justify-between gap-2" {...anim(6)}>
          <p className="min-w-0 truncate font-serif text-[12px] italic text-white/45">{identity ? `Becoming: ${identity}` : subj.name}</p>
          {focused && onDetails && (
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onDetails() }}
              data-testid="week-card-details"
              className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/15"
            >
              Details <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </motion.div>
      </div>
    </div>
  )
}

const WeekCard = memo(WeekCardImpl)
export default WeekCard

/** The Horizon: one step past the live week — where it is trending, and who you said you are becoming. */
export function HorizonCard({ width, height, identity, trend, next, focused, landed, reduced }: {
  width: number; height: number; identity: string | null
  trend: 'up' | 'flat' | 'down'
  next?: { nutrition: { title: string; sub: string }; training: { title: string; sub: string } } | null
  focused: boolean; landed: boolean; reduced?: boolean
}) {
  const anim = (i: number) => (reduced ? {} : { initial: { opacity: 0, y: 12 }, animate: landed ? { opacity: 1, y: 0 } : { opacity: 0.001, y: 12 }, transition: stagger(i) })
  const trendText = trend === 'up' ? 'Horizon lifting' : trend === 'down' ? 'Horizon eased' : 'Horizon holding'
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border-2 border-dashed text-white ${focused ? 'border-violet-300/60' : 'border-white/25'}`}
      style={{ width, height, background: 'linear-gradient(160deg, rgba(124,58,237,0.22), rgba(14,12,23,0.97) 55%)' }}
      data-testid="horizon-card"
    >
      <div className="relative flex h-full flex-col p-5">
        <motion.div {...anim(0)}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Next Sunday</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-white/85"><Compass className="h-4 w-4 text-violet-300" /> {trendText}</p>
        </motion.div>
        <motion.p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50" {...anim(1)}>Who am I becoming?</motion.p>
        <motion.h2 className={`mt-2 font-serif italic leading-snug text-white line-clamp-6 ${identity && identity.length > 140 ? 'text-[19px]' : 'text-[24px]'}`} {...anim(2)}>
          {identity ? `“${identity}”` : 'You have not written it yet. Your Mind sessions will ask.'}
        </motion.h2>
        <div className="flex-1" />
        {next && (
          <motion.div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" {...anim(3)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">What writes it</p>
            <p className="mt-1 text-[12px] text-white/85">🍽 {next.nutrition.title} <span className="text-white/50">· {next.nutrition.sub}</span></p>
            <p className="mt-1 text-[12px] text-white/85">🏋️ {next.training.title} <span className="text-white/50">· {next.training.sub}</span></p>
          </motion.div>
        )}
        <motion.p className="mt-3 text-[11px] text-white/45" {...anim(4)}>Written next Sunday from what you do this week.</motion.p>
      </div>
    </div>
  )
}
