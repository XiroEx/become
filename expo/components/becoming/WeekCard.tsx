import React, { memo, useCallback, useEffect, useState } from 'react'
import { View, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { Text } from '@/components/Text'
import Svg, { Defs, LinearGradient, Polyline, RadialGradient, Rect, Stop, Circle as SvgCircle } from 'react-native-svg'
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDownRight,
  Brain,
  UtensilsCrossed,
  Dumbbell,
  Sparkles,
  Trophy,
  ChevronRight,
  Compass,
  Scale,
  BookOpen,
  Beef,
  CalendarCheck,
} from 'lucide-react-native'
import type { Fact, WeekSnapshot, CardPillar, Highlight, WeekSignals, Suggestion, NextStep } from '@/lib/becoming/types'
import { rankSuggestions, MAX_CARD_STEPS } from '@/lib/becoming/weekSummary'
import { SUN_FADE_AT, SUN_RADIUS, WASH_FADE_AT, cardRing, cardSky, gradientLine, sunCentre } from '@/lib/becoming/cardSky'
import {
  EXIT_EDGE_RADIUS,
  EXIT_PULSE_EASING,
  EXIT_PULSE_LOW,
  EXIT_PULSE_MS,
  SPARK_DOT_R,
  SPARK_H,
  SPARK_LINE_ALPHA,
  SPARK_PADDING,
  SPARK_STROKE_WIDTH,
  SPARK_W,
  WHISPER_ALPHA,
  WHISPER_FONT_FAMILY,
  WHISPER_FONT_SIZE,
  exitEdgePlacement,
  exitEdgeShadow,
  focusTone,
  identityWhisper,
  sparklinePoints,
  type ExitEdge,
} from '@/lib/becoming/focusedCard'
import type { Pillar } from '@/lib/becoming/pillarColors'
import { useReducedMotion } from '@/lib/a11y/reducedMotion'
import { hitSlopToMinTarget, minTouchTarget } from '@/lib/a11y/touchTarget'
import { becomingStageTokens, rgbOf } from '@/lib/theme/tokens'
import { useThemeTokens } from '@/lib/theme/useThemeTokens'

const PILLAR_ICON: Record<CardPillar, typeof Brain> = {
  training: Dumbbell,
  fuel: UtensilsCrossed,
  mind: Brain,
}

const TINT: Record<Highlight['pillar'], string> = {
  training: 'hsl(28, 96%, 72%)',
  fuel: 'hsl(48, 96%, 64%)',
  mind: 'hsl(258, 90%, 85%)',
  all: 'hsl(158, 64%, 67%)',
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

/** The web keeps two of the member's own words on a finished week, never more. */
const MAX_CARD_WINS = 2

function Delta({ n }: { n: number | null }) {
  const { colors, tint } = useThemeTokens()
  if (n == null || n === 0) return null
  const up = n > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <View
      style={[
        styles.deltaBadge,
        { backgroundColor: up ? tint('success', 0.16) : tint('muted', 0.4) },
      ]}
      accessibilityLabel={`${up ? 'up' : 'down'} ${Math.abs(n)} from last week`}
      testID={`week-card-delta-${up ? 'up' : 'down'}`}
    >
      <Icon size={10} color={up ? colors.success : colors['muted-foreground']} />
      <Text
        style={[
          styles.deltaText,
          { color: up ? colors.success : colors['muted-foreground'] },
        ]}
      >
        {Math.abs(n)}
      </Text>
    </View>
  )
}

function LeadHighlight({ h }: { h: Highlight }) {
  const { colors } = useThemeTokens()
  const Icon = FACT_ICON[h.kind] ?? Dumbbell
  const color = h.change && h.value.startsWith('−') ? colors['muted-foreground'] : TINT[h.pillar]
  return (
    <View style={styles.leadHlRow} testID={`week-card-hl-${h.kind}`}>
      <View style={styles.leadValueWrap}>
        <Text style={[styles.leadValueText, { color }]}>{h.value}</Text>
        {h.of ? <Text style={[styles.leadOfText, { color: colors['muted-foreground'] }]}>{h.of}</Text> : null}
        {h.unit ? <Text style={[styles.leadUnitText, { color: colors['muted-foreground'] }]}> {h.unit}</Text> : null}
      </View>
      <View style={styles.leadMetaWrap}>
        <View style={styles.leadLabelRow}>
          <Icon size={14} color={TINT[h.pillar]} />
          <Text style={[styles.leadLabelText, { color: colors.foreground }]} numberOfLines={1}>
            {h.label}
          </Text>
        </View>
        {h.flag ? (
          <Text style={[styles.leadFlagText, { color: TINT[h.pillar] }]} numberOfLines={1}>
            {h.flag}
          </Text>
        ) : null}
      </View>
      <Delta n={h.delta} />
    </View>
  )
}

function HighlightPill({ h }: { h: Highlight }) {
  const { colors, tint } = useThemeTokens()
  const Icon = FACT_ICON[h.kind] ?? Dumbbell
  return (
    <View style={[styles.hlPill, { backgroundColor: tint('muted', 0.4) }]} testID={`week-card-hl-${h.kind}`}>
      <Icon size={12} color={TINT[h.pillar]} />
      <Text style={[styles.hlPillValue, { color: colors.foreground }]}>
        {h.value}{h.of}{h.unit ? ` ${h.unit}` : ''}
      </Text>
      <Text style={[styles.hlPillLabel, { color: colors['muted-foreground'] }]} numberOfLines={1}>
        {h.label}{h.flag ? ` · ${h.flag}` : ''}
      </Text>
      <Delta n={h.delta} />
    </View>
  )
}

/**
 * The web's `p-1` button around a 56 × 22 drawing is 64 × 30: that size is
 * the design, so the 44-point rule is held with slop, not by growing it.
 */
const SPARK_HIT_SLOP = hitSlopToMinTarget(SPARK_W + SPARK_PADDING * 2, SPARK_H + SPARK_PADDING * 2)

/**
 * The whole path in miniature (NP-343): every week's altitude as one line,
 * this week's dot in the week's colour, top-right of the focused card's
 * eyebrow. A button — tapping it zooms out to the overview, as on the web.
 * Every number is `lib/becoming/focusedCard.ts`'s, held to the web's there.
 */
function Sparkline({
  altitudes,
  at,
  color,
  onPress,
}: {
  altitudes: readonly number[]
  at: number
  color: string
  onPress?: () => void
}) {
  const { colors, isDark } = useThemeTokens()
  const { points, cx, cy } = sparklinePoints(altitudes, at)
  const line = isDark ? rgbOf(becomingStageTokens.ink, SPARK_LINE_ALPHA) : colors['muted-foreground']
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="See your whole line"
      hitSlop={SPARK_HIT_SLOP}
      style={styles.sparkBtn}
      testID="week-card-spark"
    >
      <Svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
        <Polyline points={points} fill="none" stroke={line} strokeWidth={SPARK_STROKE_WIDTH} strokeLinejoin="round" />
        <SvgCircle cx={cx} cy={cy} r={SPARK_DOT_R} fill={color} />
      </Svg>
    </Pressable>
  )
}

/**
 * The exit-edge light (NP-343): a 3 px bar in the week's colour on the edge
 * that faces the next card — top on a climb, bottom on a dip, right on a
 * hold — with the web's glow, pulsing like Tailwind's `animate-pulse`.
 * Reduce Motion holds it lit and still: the bar is the hint, the pulse is
 * decoration. The shared value is written through `set()`, Reanimated's own
 * setter, so nothing here mutates a hook's result.
 */
function ExitEdgeLight({ edge, subject, score }: { edge: ExitEdge; subject: Pillar; score: number }) {
  const reduced = useReducedMotion()
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (reduced) {
      cancelAnimation(pulse)
      pulse.set(1)
      return
    }
    const half = { duration: EXIT_PULSE_MS / 2, easing: Easing.bezier(...EXIT_PULSE_EASING) }
    pulse.set(withRepeat(withSequence(withTiming(EXIT_PULSE_LOW, half), withTiming(1, half)), -1, false))
    return () => cancelAnimation(pulse)
  }, [reduced, pulse])
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))
  return (
    <Animated.View
      pointerEvents="none"
      testID="week-card-exit"
      style={[
        styles.exitEdge,
        exitEdgePlacement(edge),
        { backgroundColor: focusTone(subject, score), boxShadow: exitEdgeShadow(subject, score) },
        pulseStyle,
      ]}
    />
  )
}

/**
 * The sky behind a week (NP-342): the web's two gradients, tinted by the
 * subject — a radial "sun" high on a climb and low on a dip, over a 160° wash
 * from the top-left — drawn with react-native-svg, since React Native has no
 * CSS gradient. Every number is `lib/becoming/cardSky.ts`'s, where the test
 * holds them to the web's.
 *
 * The 160° line depends on the box's shape, so the sky needs the card's
 * size: the stage passes `cardSize`; a card mounted bare measures itself.
 */
function CardSky({
  week,
  width,
  height,
}: {
  week: Pick<WeekSnapshot, 'weekKey' | 'subject' | 'score' | 'step'>
  width?: number
  height?: number
}) {
  const sized = width != null && height != null
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null)
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: lw, height: lh } = e.nativeEvent.layout
    setMeasured((prev) => (prev && prev.w === lw && prev.h === lh ? prev : { w: lw, h: lh }))
  }, [])
  const boxW = sized ? width : measured?.w
  const boxH = sized ? height : measured?.h
  const sky = cardSky(week.subject, week.score)
  const sun = sunCentre(week.step)
  const washId = `week-card-wash-${week.weekKey}`
  const sunId = `week-card-sun-${week.weekKey}`
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={sized ? undefined : onLayout} testID="week-card-sky">
      {boxW && boxH ? (
        <Svg width={boxW} height={boxH}>
          <Defs>
            <LinearGradient id={washId} gradientUnits="userSpaceOnUse" {...gradientLine(boxW, boxH)}>
              <Stop offset={0} stopColor={sky.wash} stopOpacity={sky.washAlpha} />
              <Stop offset={WASH_FADE_AT} stopColor={sky.wash} stopOpacity={0} />
            </LinearGradient>
            <RadialGradient id={sunId} gradientUnits="objectBoundingBox" cx={sun.cx} cy={sun.cy} rx={SUN_RADIUS.rx} ry={SUN_RADIUS.ry}>
              <Stop offset={0} stopColor={sky.sun} stopOpacity={sky.sunAlpha} />
              <Stop offset={SUN_FADE_AT} stopColor={sky.sun} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {/* The web lists the sun first, which in CSS is on top: wash, then sun. */}
          <Rect x={0} y={0} width={boxW} height={boxH} fill={`url(#${washId})`} testID="week-card-sky-wash" />
          <Rect x={0} y={0} width={boxW} height={boxH} fill={`url(#${sunId})`} testID="week-card-sky-sun" />
        </Svg>
      ) : null}
    </View>
  )
}

export interface WeekCardProps {
  week: WeekSnapshot
  signals: WeekSignals
  totalWeeks?: number
  identity?: string | null
  next?: { nutrition?: Suggestion | null; training?: Suggestion | null; fuel?: Suggestion | null } | NextStep[] | null
  onDetails?: () => void
  onNavigate?: (url: string) => void
  isPeak?: boolean
  /**
   * The stage's focused card (NP-343). Only it carries the sparkline and the
   * exit-edge light, as on the web; a neighbour, or a card mounted bare,
   * draws neither whatever else it is given.
   */
  focused?: boolean
  /** Which edge faces the next card — the light that hints the way forward. */
  exitEdge?: ExitEdge | null
  /** The whole path in miniature (top-right of the eyebrow): every week's altitude, and this week's index on it. */
  spark?: { altitudes: readonly number[]; at: number } | null
  /** Tapping the sparkline: the stage's `enterOverview`. */
  onSparkline?: () => void
  /**
   * The stage's card box (`cardSize`), both or neither. Given, the card IS
   * that size — content is laid out inside it, the "what to work on" block
   * and the identity row sit on its bottom edge, and anything that will not
   * fit is clipped, as on the web (NP-342). Without, the card fits its content.
   */
  width?: number
  height?: number
}

export const WeekCard = memo(function WeekCard({
  week: w,
  signals,
  totalWeeks,
  identity,
  next,
  onDetails,
  onNavigate,
  isPeak,
  focused = false,
  exitEdge = null,
  spark = null,
  onSparkline,
  width,
  height,
}: WeekCardProps) {
  const { colors, tint, isDark } = useThemeTokens()
  const leadHl = signals.highlights[0] ?? null
  const extraHls = signals.highlights.slice(1)
  const currentWeek = !!w.isCurrent
  const sized = width != null && height != null
  const stepText = w.gap ? 'held' : isPeak ? 'new high' : w.step === 'up' ? 'climbed' : w.step === 'flat' ? 'held' : w.step === 'down' ? 'a dip' : 'start'

  // Step badge
  const isUp = w.step === 'up'
  const StepIcon = w.step === 'up' ? ArrowUpRight : w.step === 'down' ? ArrowDownRight : ArrowRight

  // The web's card ground and ring (NP-342): `#0e0c17` under the sky, a
  // hairline in the week's hue — two px and nearly solid on the live week.
  // The ground is the stage's own token in the dark palette; a card mounted
  // outside the stage keeps following the system's `card`.
  const ground = isDark ? rgbOf(becomingStageTokens.card) : colors.card
  const ring = cardRing(w.subject, w.score, currentWeek)
  // The focused card's extras (NP-343): the sparkline's dot and the exit-edge
  // bar are the web's `tone`; the whisper is 45% white on the stage's dark
  // ground, and follows the system's muted ink on a card mounted elsewhere.
  const tone = focusTone(w.subject, w.score)
  const whisper = isDark ? rgbOf(becomingStageTokens.ink, WHISPER_ALPHA) : colors['muted-foreground']

  // Suggestions for What to work on next
  const steps: { pillar: CardPillar; suggestion: Suggestion }[] = React.useMemo(() => {
    if (!currentWeek || !next) return []
    if (Array.isArray(next)) return next
    const map: Partial<Record<CardPillar, Suggestion | null>> = {
      training: next.training ?? null,
      fuel: (next as { fuel?: Suggestion; nutrition?: Suggestion }).fuel ?? (next as { fuel?: Suggestion; nutrition?: Suggestion }).nutrition ?? null,
    }
    return rankSuggestions(signals.active, map, MAX_CARD_STEPS)
  }, [currentWeek, next, signals.active])

  // The web's rule: the live card ends on WHAT TO WORK ON and a finished week
  // keeps the member's own words (two at most) — never both. It is also what
  // keeps a card of one fixed height from running off its bottom edge.
  const wins = steps.length ? [] : (w.mind?.wins ?? []).slice(0, MAX_CARD_WINS)

  return (
    <View
      style={[
        styles.cardShell,
        sized ? { width, height } : null,
        {
          backgroundColor: ground,
          borderWidth: ring.width,
          borderColor: ring.color,
        },
      ]}
      testID={`week-card-${w.weekKey}`}
      accessibilityLabel={`Week card for ${w.label}. ${w.headline}.`}
    >
      <CardSky week={w} width={width} height={height} />
      {/* Edge light toward the next card — the focused card only, as on the web. */}
      {focused && exitEdge ? <ExitEdgeLight edge={exitEdge} subject={w.subject} score={w.score} /> : null}
      <View style={[styles.cardPadding, sized && styles.fill]} testID="week-card-body">
        {/* Eyebrow */}
        <View style={styles.eyebrowRow}>
          <View>
            <Text style={[styles.eyebrowTop, { color: colors['muted-foreground'] }]}>
              {w.gap
                ? 'Away'
                : w.isCurrent
                ? `This week · day ${w.daysElapsed ?? 1} of 7`
                : `Week ${w.index + 1}${totalWeeks && totalWeeks > 1 ? ` of ${totalWeeks}` : ''}`}
            </Text>
            <Text style={[styles.eyebrowLabel, { color: colors.foreground }]}>{w.label}</Text>
          </View>

          <View style={styles.eyebrowRight}>
            {focused && spark ? <Sparkline altitudes={spark.altitudes} at={spark.at} color={tone} onPress={onSparkline} /> : null}

            {w.isCurrent ? (
              <View style={[styles.liveBadge, { backgroundColor: tint('muted', 0.5) }]} testID="week-card-live">
                <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.liveText, { color: colors.foreground }]}>live</Text>
              </View>
            ) : w.step || isPeak ? (
              <View
                style={[
                  styles.stepBadge,
                  {
                    backgroundColor: isPeak
                      ? tint('accent', 0.22)
                      : isUp
                      ? tint('accent', 0.2)
                      : tint('muted', 0.4),
                  },
                ]}
                testID={`week-card-step-${isPeak ? 'peak' : w.step}`}
              >
                <StepIcon
                  size={12}
                  color={isPeak || isUp ? colors.accent : colors.foreground}
                />
                <Text
                  style={[
                    styles.stepText,
                    { color: isPeak || isUp ? colors.accent : colors.foreground },
                  ]}
                >
                  {stepText}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Headline & Sub */}
        <View style={{ gap: 4 }}>
          <Text style={[styles.headlineText, { color: colors.foreground }]} testID="week-card-headline">
            {w.headline}
          </Text>
          {w.sub ? (
            <Text style={[styles.subText, { color: colors['muted-foreground'] }]} testID="week-card-sub">
              {w.sub}
            </Text>
          ) : null}
        </View>

        {/* Highlights */}
        {signals.highlights.length > 0 && (
          <View style={[styles.highlightsContainer, { backgroundColor: tint('muted', 0.3) }]}>
            {leadHl && <LeadHighlight h={leadHl} />}

            {extraHls.length > 0 && (
              <View style={styles.highlightPillsWrap}>
                {extraHls.map((h) => (
                  <HighlightPill key={`${h.pillar}-${h.kind}`} h={h} />
                ))}
              </View>
            )}

            {signals.hasDeltas && (
              <Text style={[styles.deltasNote, { color: colors['muted-foreground'] }]}>Changes vs the week before</Text>
            )}
          </View>
        )}

        {/* Nudge button */}
        {signals.nudge && (
          <Pressable
            testID="week-card-nudge"
            style={[minTouchTarget, styles.nudgeBtn, { backgroundColor: tint('muted', 0.5) }]}
            onPress={() => onNavigate?.(signals.nudge!.href)}
            accessibilityRole="button"
            accessibilityLabel={signals.nudge.label}
          >
            {(() => {
              const p = signals.nudge.pillar
              const Icon = PILLAR_ICON[p] ?? Brain
              return <Icon size={14} color={TINT[p]} />
            })()}
            <Text style={[styles.nudgeText, { color: colors.foreground }]}>{signals.nudge.label}</Text>
            <ChevronRight size={12} color={colors['muted-foreground']} />
          </Pressable>
        )}

        {/* Banked wins */}
        {wins.length > 0 && (
          <View style={styles.winsWrap} testID="week-card-wins">
            {wins.map((win: string, idx: number) => (
              <View key={`win-${idx}`} style={styles.winRow}>
                <Sparkles size={14} color={colors.accent} style={{ marginTop: 2 }} />
                <Text style={[styles.winText, { color: colors.foreground }]}>{win}</Text>
              </View>
            ))}
          </View>
        )}

        {/* The web's `flex-1`: what follows sits on the card's bottom edge. */}
        {sized && <View style={styles.spacer} testID="week-card-spacer" />}

        {/* What writes it (Steps) */}
        {steps.length > 0 && (
          <View style={[styles.stepsCard, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]} testID="week-card-steps">
            <Text style={[styles.stepsKicker, { color: colors['muted-foreground'] }]}>What to work on</Text>
            <View style={styles.stepsList}>
              {steps.map((st) => {
                const Icon = PILLAR_ICON[st.pillar] ?? Brain
                return (
                  <Pressable
                    key={st.suggestion.key}
                    testID={`week-card-step-link-${st.pillar}`}
                    style={styles.stepRow}
                    onPress={() => onNavigate?.(st.suggestion.url)}
                    accessibilityRole="button"
                    accessibilityLabel={`${st.suggestion.title} · ${st.suggestion.sub}`}
                  >
                    <Icon size={14} color={TINT[st.pillar]} style={{ marginTop: 3 }} />
                    <View style={styles.stepContent}>
                      <Text style={[styles.stepTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {st.suggestion.title}{' '}
                        <Text style={{ color: colors['muted-foreground'], fontWeight: '400' }}>
                          · {st.suggestion.sub}
                        </Text>
                      </Text>
                    </View>
                    <ChevronRight size={12} color={colors['muted-foreground']} style={{ marginTop: 3 }} />
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}

        {/* Identity & Details Footer */}
        <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
          {/* The identity whisper: the web's `Becoming: <identity>`, serif italic at 45% white. */}
          <Text style={[styles.identityText, { color: whisper }]} numberOfLines={1} testID="week-card-identity">
            {identityWhisper(w.identity ?? identity, w.subject)}
          </Text>

          {onDetails && (
            <Pressable
              style={[minTouchTarget, styles.detailsBtn, { backgroundColor: tint('muted', 0.5) }]}
              onPress={onDetails}
              accessibilityRole="button"
              accessibilityLabel="View week details"
              testID="week-card-details-btn"
            >
              <Text style={[styles.detailsBtnText, { color: colors.foreground }]}>Details</Text>
              <ChevronRight size={14} color={colors.foreground} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
})

export interface HorizonCardProps {
  identity?: string | null
  trend?: 'up' | 'down' | 'flat'
  next?: { nutrition?: Suggestion | null; training?: Suggestion | null; fuel?: Suggestion | null } | NextStep[] | null
  active?: CardPillar[]
  onNavigate?: (url: string) => void
  /** The stage's card box, like `WeekCard`'s: every card on the stage is one height (NP-342). */
  width?: number
  height?: number
}

export function HorizonCard({
  identity,
  trend = 'flat',
  next,
  active = ['training', 'fuel', 'mind'],
  onNavigate,
  width,
  height,
}: HorizonCardProps) {
  const { colors, tint, isDark } = useThemeTokens()
  const sized = width != null && height != null
  const trendText = trend === 'up' ? 'Horizon lifting' : trend === 'down' ? 'Horizon eased' : 'Horizon holding'
  const steps = React.useMemo(() => {
    if (!next) return []
    if (Array.isArray(next)) return next
    const map: Partial<Record<CardPillar, Suggestion | null>> = {
      training: next.training ?? null,
      fuel: (next as { fuel?: Suggestion; nutrition?: Suggestion }).fuel ?? (next as { fuel?: Suggestion; nutrition?: Suggestion }).nutrition ?? null,
    }
    return rankSuggestions(active, map, MAX_CARD_STEPS)
  }, [next, active])

  return (
    <View
      style={[
        styles.horizonShell,
        sized ? { width, height } : null,
        {
          backgroundColor: colors.card,
          borderColor: isDark ? 'hsla(258, 80%, 70%, 0.4)' : 'hsla(258, 80%, 50%, 0.3)',
        },
      ]}
      testID="horizon-card"
      accessibilityLabel="Horizon card. Next week's story is unwritten."
    >
      <View style={[styles.cardPadding, sized && styles.fill]} testID="horizon-card-body">
        <View style={styles.eyebrowRow}>
          <View>
            <Text style={[styles.eyebrowTop, { color: colors['muted-foreground'] }]}>Next Sunday</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Compass size={16} color={isDark ? 'hsl(258, 90%, 80%)' : 'hsl(258, 90%, 45%)'} />
              <Text style={[styles.eyebrowLabel, { color: colors.foreground, marginTop: 0 }]}>{trendText}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.stepsKicker, { color: colors['muted-foreground'], marginTop: 16 }]}>Who am I becoming?</Text>
        {/* The web's `line-clamp-6`: the words never push "what writes it" off the card. */}
        <Text style={[styles.horizonIdentity, { color: colors.foreground }]} numberOfLines={6}>
          {identity ? `“${identity}”` : 'You have not written it yet. Your Mind sessions will ask.'}
        </Text>

        {/* The web's `flex-1`: what follows sits on the card's bottom edge. */}
        {sized && <View style={styles.spacer} testID="horizon-card-spacer" />}

        {steps.length > 0 ? (
          <View style={[styles.stepsCard, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]} testID="horizon-writes">
            <Text style={[styles.stepsKicker, { color: colors['muted-foreground'] }]}>What writes it</Text>
            <View style={styles.stepsList}>
              {steps.map((st) => {
                const Icon = PILLAR_ICON[st.pillar] ?? Brain
                return (
                  <Pressable
                    key={st.suggestion.key}
                    testID={`horizon-next-${st.pillar}`}
                    style={styles.stepRow}
                    onPress={() => onNavigate?.(st.suggestion.url)}
                    accessibilityRole="button"
                    accessibilityLabel={`${st.suggestion.title} · ${st.suggestion.sub}`}
                  >
                    <Icon size={14} color={TINT[st.pillar]} style={{ marginTop: 3 }} />
                    <View style={styles.stepContent}>
                      <Text style={[styles.stepTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {st.suggestion.title}{' '}
                        <Text style={{ color: colors['muted-foreground'], fontWeight: '400' }}>
                          · {st.suggestion.sub}
                        </Text>
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        <Text style={[styles.horizonFooter, { color: colors['muted-foreground'] }]}>Written next Sunday from what you do this week.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cardShell: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  horizonShell: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  cardPadding: {
    padding: 20,
    gap: 12,
  },
  /** A sized card's column fills the box, so the spacer has room to take. */
  fill: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eyebrowTop: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  eyebrowLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  eyebrowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sparkBtn: {
    padding: SPARK_PADDING,
    borderRadius: 6,
  },
  exitEdge: {
    position: 'absolute',
    borderRadius: EXIT_EDGE_RADIUS,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stepText: {
    fontSize: 11,
    fontWeight: '700',
  },
  headlineText: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  subText: {
    fontSize: 13,
    lineHeight: 18,
  },
  highlightsContainer: {
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  leadHlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leadValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  leadValueText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  leadOfText: {
    fontSize: 14,
    fontWeight: '700',
  },
  leadUnitText: {
    fontSize: 12,
    fontWeight: '600',
  },
  leadMetaWrap: {
    flex: 1,
    minWidth: 0,
  },
  leadLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leadLabelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  leadFlagText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  highlightPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  hlPillValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  hlPillLabel: {
    fontSize: 11,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: '700',
  },
  deltasNote: {
    fontSize: 10,
    marginTop: 2,
  },
  nudgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  nudgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  winsWrap: {
    gap: 6,
  },
  winRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  winText: {
    flex: 1,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  stepsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  stepsKicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stepsList: {
    gap: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
  },
  stepContent: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepSub: {
    fontSize: 10,
    lineHeight: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  identityText: {
    flex: 1,
    fontSize: WHISPER_FONT_SIZE,
    fontStyle: 'italic',
    fontFamily: WHISPER_FONT_FAMILY,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  horizonIdentity: {
    fontSize: 20,
    fontStyle: 'italic',
    lineHeight: 26,
  },
  horizonFooter: {
    fontSize: 11,
    marginTop: 4,
  },
})

export default WeekCard
