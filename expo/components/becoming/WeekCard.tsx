import React, { memo } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { Text } from '@/components/Text'
import Svg, { Polyline, Circle as SvgCircle } from 'react-native-svg'
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
import { pillarColor } from '@/lib/becoming/pillarColors'
import { minTouchTarget } from '@/lib/a11y/touchTarget'
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

function Sparkline({ scores }: { scores: number[] }) {
  const { colors } = useThemeTokens()
  if (scores.length < 2) return null
  const W = 52
  const H = 18
  const pad = 2
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2)
    const y = H - pad - ((s - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const lastX = W - pad
  const lastY = H - pad - ((scores[scores.length - 1]! - min) / range) * (H - pad * 2)

  return (
    <Svg width={W} height={H} style={styles.sparkWrap} accessibilityLabel="Week score trend">
      <Polyline
        points={pts.join(' ')}
        fill="none"
        stroke={colors['muted-foreground']}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <SvgCircle cx={lastX} cy={lastY} r="2" fill={colors['muted-foreground']} />
    </Svg>
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
}: WeekCardProps) {
  const { colors, tint, isDark } = useThemeTokens()
  const leadHl = signals.highlights[0] ?? null
  const extraHls = signals.highlights.slice(1)
  const currentWeek = !!w.isCurrent
  const stepText = w.gap ? 'held' : isPeak ? 'new high' : w.step === 'up' ? 'climbed' : w.step === 'flat' ? 'held' : w.step === 'down' ? 'a dip' : 'start'

  // Step badge
  const isUp = w.step === 'up'
  const StepIcon = w.step === 'up' ? ArrowUpRight : w.step === 'down' ? ArrowDownRight : ArrowRight

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

  return (
    <View
      style={[
        styles.cardShell,
        {
          backgroundColor: currentWeek
            ? isDark
              ? 'hsl(258, 40%, 14%)'
              : 'hsl(258, 80%, 97%)'
            : colors.card,
          borderWidth: currentWeek ? 2 : 1,
          borderColor: currentWeek
            ? pillarColor(w.subject, w.score, 65)
            : colors.border,
        },
      ]}
      testID={`week-card-${w.weekKey}`}
      accessibilityLabel={`Week card for ${w.label}. ${w.headline}.`}
    >
      <View style={styles.cardPadding}>
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
            {w.spark && w.spark.length >= 2 ? <Sparkline scores={w.spark} /> : null}

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
        {w.mind?.wins && w.mind.wins.length > 0 && (
          <View style={styles.winsWrap} testID="week-card-wins">
            {w.mind.wins.map((win: string, idx: number) => (
              <View key={`win-${idx}`} style={styles.winRow}>
                <Sparkles size={14} color={colors.accent} style={{ marginTop: 2 }} />
                <Text style={[styles.winText, { color: colors.foreground }]}>{win}</Text>
              </View>
            ))}
          </View>
        )}

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
          <Text style={[styles.identityText, { color: colors['muted-foreground'] }]} numberOfLines={1}>
            {w.identity ? `“${w.identity}”` : identity ? `“${identity}”` : 'The Becoming'}
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
}

export function HorizonCard({
  identity,
  trend = 'flat',
  next,
  active = ['training', 'fuel', 'mind'],
  onNavigate,
}: HorizonCardProps) {
  const { colors, tint, isDark } = useThemeTokens()
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
        {
          backgroundColor: colors.card,
          borderColor: isDark ? 'hsla(258, 80%, 70%, 0.4)' : 'hsla(258, 80%, 50%, 0.3)',
        },
      ]}
      testID="horizon-card"
      accessibilityLabel="Horizon card. Next week's story is unwritten."
    >
      <View style={styles.cardPadding}>
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
        <Text style={[styles.horizonIdentity, { color: colors.foreground }]}>
          {identity ? `“${identity}”` : 'You have not written it yet. Your Mind sessions will ask.'}
        </Text>

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
    marginBottom: 16,
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
    marginBottom: 24,
  },
  cardPadding: {
    padding: 20,
    gap: 12,
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
  sparkWrap: {
    padding: 2,
    borderRadius: 6,
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
    fontSize: 12,
    fontStyle: 'italic',
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
