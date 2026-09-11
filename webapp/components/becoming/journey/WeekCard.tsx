'use client'

// One week of The Becoming, as a card in world space. Pure presentation:
// the canvas decides where it sits, how big it is and how blurred; this
// decides what it says.
//
//   • colour = what the week was ABOUT (training ember, fuel honey, mind
//     iris, all three verdigris, empty fog); saturation = how consistent
//   • the highlights: the few things this member actually did that week,
//     ranked — a lead number drawn large and up to two behind it, each with
//     how it moved against last week (lib/becoming/signals decides all of
//     it). No fixed rows, so no "0 sessions", and the shape follows the week
//   • the member's own words (banked wins, identity) set in a serif italic
//   • the Horizon variant: one step past the live week — where this week is
//     trending, and who you said you are becoming

import { memo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowRight, ArrowDownRight, Flag, Brain, UtensilsCrossed, Dumbbell, Sparkles, Trophy, ChevronRight, Compass, Scale, BookOpen, Beef, CalendarCheck } from 'lucide-react'
import type { Fact, WeekSnapshot } from '@/lib/becoming/weeks'
import type { CardPillar, Highlight, WeekSignals } from '@/lib/becoming/signals'
import { PILLAR, pillarColor } from '@/lib/pillarColors'

// The pillar palette lives in lib/pillarColors so the journey, the details, the
// streaks page and the dashboard tiles cannot drift apart.
export { PILLAR as SUBJECT } from '@/lib/pillarColors'
export { pillarColor as weekColor } from '@/lib/pillarColors'

const PILLAR_ICON: Record<CardPillar, { Icon: typeof Brain; className: string }> = {
  training: { Icon: Dumbbell, className: 'text-orange-300' },
  fuel: { Icon: UtensilsCrossed, className: 'text-amber-300' },
  mind: { Icon: Brain, className: 'text-violet-300' },
}

// A highlight is coloured by its pillar and drawn with the icon of the thing
// itself — a trophy for a PR, a scale for the weigh-in — so a card that leads
// with a lift does not look like one that leads with a meal log.
const TINT: Record<Highlight['pillar'], string> = {
  training: '#fdba74',
  fuel: '#fcd34d',
  mind: '#c4b5fd',
  all: '#6ee7b7',
}
const FACT_ICON: Record<Fact, typeof Brain> = {
  workouts: Dumbbell,
  prs: Trophy,
  logging: UtensilsCrossed,
  protein: Beef,
  weight: Scale,
  sessions: Brain,
  checkins: Brain,
  state: Brain,
  chapter: BookOpen,
  active: CalendarCheck,
}

/**
 * How the number moved against the same stretch of last week. Nothing is drawn
 * when it did not move: "same as last week" is not news, and a card that
 * prints a chip on every row is back to being wallpaper.
 *
 * A drop is grey rather than red. The card reports a week; it does not scold
 * anyone for one.
 */
function Delta({ n }: { n: number | null }) {
  if (n == null || n === 0) return null
  const up = n > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums"
      style={{ background: up ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.08)', color: up ? '#6ee7b7' : 'rgba(255,255,255,0.55)' }}
      data-testid={`week-card-delta-${up ? 'up' : 'down'}`}
      aria-label={`${up ? 'up' : 'down'} ${Math.abs(n)} from last week`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {Math.abs(n)}
    </span>
  )
}

/** The one thing this week is most about — drawn large. */
function LeadHighlight({ h }: { h: Highlight }) {
  const Icon = FACT_ICON[h.kind]
  return (
    <div className="flex items-center gap-3" data-testid={`week-card-hl-${h.kind}`} data-lead="true">
      <p className="flex shrink-0 items-baseline tabular-nums">
        <span className="text-[30px] font-black leading-none tracking-tight" style={{ color: h.change && h.value.startsWith('−') ? 'rgba(255,255,255,0.6)' : TINT[h.pillar] }}>{h.value}</span>
        {h.of && <span className="text-[15px] font-bold text-white/40">{h.of}</span>}
        {h.unit && <span className="ml-1 text-[13px] font-semibold text-white/55">{h.unit}</span>}
      </p>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold leading-tight text-white/80">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: TINT[h.pillar] }} aria-hidden="true" />
          <span className="truncate">{h.label}</span>
        </p>
        {h.flag && <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: TINT[h.pillar] }}>{h.flag}</p>}
      </div>
      <Delta n={h.delta} />
    </div>
  )
}

/** Everything else worth a glance — one line each, no table. */
function HighlightPill({ h }: { h: Highlight }) {
  const Icon = FACT_ICON[h.kind]
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/[0.07] px-2 py-1 text-[11px] text-white/70" data-testid={`week-card-hl-${h.kind}`}>
      <Icon className="h-3 w-3 shrink-0" style={{ color: TINT[h.pillar] }} aria-hidden="true" />
      <span className="shrink-0 font-bold tabular-nums text-white/90">{h.value}{h.of}{h.unit ? ` ${h.unit}` : ''}</span>
      <span className="truncate">{h.label}{h.flag ? ` · ${h.flag}` : ''}</span>
      <Delta n={h.delta} />
    </span>
  )
}

const stagger = (i: number) => ({ delay: 0.06 * i, duration: 0.42, ease: [0.16, 1, 0.3, 1] as const })

export interface WeekCardProps {
  week: WeekSnapshot
  /**
   * What this week is worth saying, ranked, and the one invitation worth
   * making. Computed by the canvas because it takes the whole journey to know:
   * whether a count is a record depends on every week before it.
   */
  signals: WeekSignals
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

function WeekCardImpl({ week: w, signals, width, height, focused, landed, compact, exitEdge, totalWeeks, identity, next, onDetails, reduced, isPeak, spark, onSparkline }: WeekCardProps) {
  const subj = PILLAR[w.subject]
  const tone = pillarColor(w.subject, w.score, 62)
  const toneSoft = pillarColor(w.subject, w.score, 60, 0.18)
  const StepIcon = w.step === 'up' ? ArrowUpRight : w.step === 'down' ? ArrowDownRight : w.step === 'start' ? Flag : ArrowRight
  const stepText = w.gap ? 'held' : isPeak ? 'new high' : w.step === 'up' ? 'climbed' : w.step === 'flat' ? 'held' : w.step === 'down' ? 'a dip' : 'start'
  // The live card also carries "what writes this card", so it keeps one of the
  // member's lines rather than two — the card is a fixed height, and it is the
  // Details button that falls off the bottom when it overflows.
  const writes = w.isCurrent && !!next && (signals.active.includes('fuel') || signals.active.includes('training'))
  const wins = w.mind.wins.slice(0, writes ? 1 : 2)
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

        {/* What this week actually had — ranked, never a zero, never the headline again */}
        {!w.gap && signals.highlights.length > 0 && (
          <motion.div className="mt-4 rounded-2xl bg-white/[0.06] p-3" {...anim(3)} data-testid="week-card-highlights">
            <LeadHighlight h={signals.highlights[0]} />
            {signals.highlights.length > 1 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {signals.highlights.slice(1).map(h => <HighlightPill key={h.kind} h={h} />)}
              </div>
            )}
            {signals.hasDeltas && (
              <p className="mt-1.5 text-[10px] leading-none text-white/35">
                Changes {w.isCurrent ? 'vs the same days last week' : 'vs the week before'}
              </p>
            )}
          </motion.div>
        )}

        {/* One invitation, live week only, for a pillar going unused */}
        {signals.nudge && (
          <motion.div className="mt-2" {...anim(4)}>
            <Link
              href={signals.nudge.href}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              data-testid="week-card-nudge"
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/55 transition-colors hover:bg-white/10 hover:text-white/85"
            >
              {(() => { const { Icon, className } = PILLAR_ICON[signals.nudge.pillar]; return <Icon className={`h-3.5 w-3.5 ${className}`} /> })()}
              {signals.nudge.label}
              <ChevronRight className="h-3 w-3" />
            </Link>
          </motion.div>
        )}

        {/* Evidence — the member's own words in serif. A PR is a highlight
            now (or the headline), so it is not listed a third time here. */}
        {wins.length > 0 && (
          <motion.div className="mt-3 space-y-1.5" {...anim(5)}>
            {wins.map((win, i) => (
              <p key={i} className="flex items-start gap-1.5 font-serif text-[14px] italic leading-snug text-white/80"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" /><span className="line-clamp-2">“{win}”</span></p>
            ))}
          </motion.div>
        )}

        <div className="flex-1" />

        {/* Live week: what writes this card — only for pillars in use, since a
            nutrition target means nothing to someone who does not log food */}
        {writes && next && (
          <motion.div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3" {...anim(6)} data-testid="week-card-writes">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">What writes this card</p>
            {signals.active.includes('fuel') && <p className="mt-1 truncate text-[12px] text-white/85">🍽 {next.nutrition.title}</p>}
            {signals.active.includes('training') && <p className="mt-1 truncate text-[12px] text-white/85">🏋️ {next.training.title}</p>}
          </motion.div>
        )}
        {/* Identity whisper */}
        <motion.div className="mt-2 flex items-end justify-between gap-2" {...anim(7)}>
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
export function HorizonCard({ width, height, identity, trend, next, active = ['training', 'fuel', 'mind'], focused, landed, reduced }: {
  width: number; height: number; identity: string | null
  trend: 'up' | 'flat' | 'down'
  next?: { nutrition: { title: string; sub: string }; training: { title: string; sub: string } } | null
  /** Pillars the member is actually using — the same filter the live card applies. */
  active?: CardPillar[]
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
        {next && (active.includes('fuel') || active.includes('training')) && (
          <motion.div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" {...anim(3)} data-testid="horizon-writes">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">What writes it</p>
            {active.includes('fuel') && <p className="mt-1 text-[12px] text-white/85">🍽 {next.nutrition.title} <span className="text-white/50">· {next.nutrition.sub}</span></p>}
            {active.includes('training') && <p className="mt-1 text-[12px] text-white/85">🏋️ {next.training.title} <span className="text-white/50">· {next.training.sub}</span></p>}
          </motion.div>
        )}
        <motion.p className="mt-3 text-[11px] text-white/45" {...anim(4)}>Written next Sunday from what you do this week.</motion.p>
      </div>
    </div>
  )
}
