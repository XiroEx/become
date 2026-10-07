import React, { useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native'
import { Text } from '@/components/Text'
import {
  X,
  Brain,
  UtensilsCrossed,
  Dumbbell,
  BookOpen,
  Trophy,
  Sparkles,
  Lock,
  ArrowRight,
  Check,
  Minus,
  Flame,
  HelpCircle,
  ChevronDown,
  Info,
} from 'lucide-react-native'
import type { WeekSnapshot, SummaryPillar, Suggestion } from '@/lib/becoming/types'
import { CHAPTERS, SYSTEM_INFO } from '@become/core/mindXP'
import type {
  GoalProgressResponse,
  MindProgressResponse,
  MindWin,
  MindStateLog,
  MindState,
  ProgressCurrentProgram,
} from '@become/api-client'
import { readReached } from '@become/core/goals/status'
import { fmtUnit } from '@/lib/goals/pace'
import { PILLAR as SUBJECT, pillarColor as weekColor, STREAK_INK } from '@/lib/becoming/pillarColors'
import { WeightChart } from './WeightChart'
import {
  StrengthTargetSheet,
  EST_MAX_LABEL,
  EST_MAX_LABEL_SHORT,
} from './StrengthTargetSheet'
import { formatVolume, formatWorkTime } from '@/lib/becoming/weekTraining'
import {
  summarizeWeek,
  previewList,
} from '@/lib/becoming/weekSummary'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeTokens } from '@/lib/theme/useThemeTokens'
import { minTouchTarget } from '@/lib/a11y/touchTarget'

// How a mind state reads on the dots/legend in "How you've shown up" — the
// same words as webapp/components/becoming/BecomingDetails.tsx#STATE_META.
// `dot` names a theme TOKEN (NP-123: no hex literals outside lib/theme/tokens.ts),
// resolved to an actual colour via `colors[...]` at render time. Three of the
// four reuse the flat mood palette, which already carries the same hues.
const STATE_META: Record<MindState, { label: string; dot: 'mood-great' | 'state-low-energy' | 'mood-okay' | 'mood-bad' }> = {
  locked_in: { label: 'Locked in', dot: 'mood-great' },
  low_energy: { label: 'Low energy', dot: 'state-low-energy' },
  distracted: { label: 'Distracted', dot: 'mood-okay' },
  stressed: { label: 'Stressed', dot: 'mood-bad' },
}

// Mind's own "what next" — keyed by the state that showed up most. Mirrors
// webapp's FOCUS_BY_STATE. Deliberately `info` severity so it can never
// outrank a real goal signal when it is folded into Story's next steps.
const FOCUS_BY_STATE: Record<MindState, { title: string; sub: string }> = {
  stressed: { title: 'Calm the storm', sub: 'Stress keeps showing up — lean on state-shift + breath.' },
  distracted: { title: 'Cut the noise', sub: 'Distraction is the pattern — practice focus + one-thing.' },
  low_energy: { title: 'Do it anyway', sub: 'Low energy lately — discipline reps move you regardless.' },
  locked_in: { title: 'Keep stacking', sub: 'You’re locked in — bank the momentum and protect the streak.' },
}

export type DetailsTab = 'story' | 'training' | 'fuel' | 'mind'

type TrainView = 'week' | 'strength'

type SheetState =
  | { kind: 'metric' }
  | {
      kind: 'target'
      slug: string
      name: string
      current: number
      target: number
      reached: boolean
    }

const TABS: {
  id: DetailsTab
  label: string
  Icon: typeof Brain
  hue: string
}[] = [
  { id: 'story', label: 'Story', Icon: BookOpen, hue: 'hsl(258, 90%, 76%)' },
  { id: 'training', label: 'Training', Icon: Dumbbell, hue: SUBJECT.training.hsl },
  { id: 'fuel', label: 'Fuel', Icon: UtensilsCrossed, hue: SUBJECT.fuel.hsl },
  { id: 'mind', label: 'Mind', Icon: Brain, hue: SUBJECT.mind.hsl },
]

const SUMMARY_HUE: Record<SummaryPillar, string> = {
  training: SUBJECT.training.hsl,
  fuel: SUBJECT.fuel.hsl,
  mind: SUBJECT.mind.hsl,
  you: 'hsl(258, 90%, 76%)',
}

function fmtDate(d: string | number | Date | null | undefined): string {
  return d
    ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—'
}

function fmtDayMarker(d: string | number | Date | null | undefined): string {
  return d
    ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : '—'
}

function relDay(d: string | number | Date): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return fmtDate(d)
}

function Glass({
  children,
  style,
  hue,
  testID,
}: {
  children: React.ReactNode
  style?: object
  hue?: string
  testID?: string
}) {
  const { colors, tint } = useThemeTokens()
  return (
    <View
      style={[
        styles.glass,
        {
          backgroundColor: tint('muted', 0.25),
          borderColor: hue ?? colors.border,
        },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  const { colors } = useThemeTokens()
  return <Text style={[styles.eyebrow, { color: colors['muted-foreground'] }]}>{children}</Text>
}

function Cell({
  label,
  value,
  sub,
  hue,
}: {
  label: string
  value: string
  sub?: string
  hue?: string
}) {
  const { colors, tint } = useThemeTokens()
  return (
    <View style={[styles.cell, { backgroundColor: tint('muted', 0.2) }]}>
      <Text style={[styles.cellLabel, { color: colors['muted-foreground'] }]}>{label}</Text>
      <Text style={[styles.cellValue, { color: hue ?? colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.cellSub, { color: colors['muted-foreground'] }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

function NextCard({
  title,
  sub,
  url,
  hue,
  onPress,
}: {
  title: string
  sub: string
  url: string
  hue: string
  onPress?: (url: string) => void
}) {
  const { colors, tint } = useThemeTokens()
  return (
    <Pressable
      onPress={() => onPress?.(url)}
      style={[styles.nextCard, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${title} · ${sub}`}
    >
      <Sparkles size={16} color={hue} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.nextCardTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.nextCardSub, { color: colors['muted-foreground'] }]}>{sub}</Text>
      </View>
      <ArrowRight size={16} color={colors['muted-foreground']} style={{ marginTop: 2 }} />
    </Pressable>
  )
}

function MoreButton({
  open,
  label,
  onClick,
  testId,
}: {
  open: boolean
  label: string
  onClick: () => void
  testId: string
}) {
  const { colors, tint } = useThemeTokens()
  return (
    <Pressable
      onPress={onClick}
      testID={testId}
      style={[styles.moreBtn, { backgroundColor: tint('muted', 0.4) }]}
      accessibilityRole="button"
    >
      <Text style={[styles.moreBtnText, { color: colors.foreground }]}>{open ? 'Show less' : label}</Text>
      <ChevronDown
        size={14}
        color={colors['muted-foreground']}
        style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
      />
    </Pressable>
  )
}

export interface BecomingDetailsProps {
  open: boolean
  onClose: () => void
  weeks?: WeekSnapshot[]
  weighIns?: { day: string; value: number }[]
  todayKey?: string
  unit?: 'lbs' | 'kg'
  identity?: string | null
  chapter?: number
  becomingScore?: number
  initialTab?: DetailsTab
  goals?: GoalProgressResponse | null
  /** GET /api/mind/progress — chapterHistory and xpProgress for the Mind tab. */
  mindProgress?: MindProgressResponse | null
  /** GET /api/mind/wins?limit=60, newest first — the evidence wall. */
  wins?: MindWin[]
  /** GET /api/mind/state?limit=60, newest first — the mood dots. */
  stateLogs?: MindStateLog[]
  /** GET /api/mind/session — the day streak. */
  streak?: number
  /** GET /api/progress — the active program, for Training's "Next" sub. */
  program?: ProgressCurrentProgram | null
  onJumpToWeek?: (weekKey: string) => void
  onNavigate?: (url: string) => void
}

export function BecomingDetails({
  open,
  onClose,
  weeks = [],
  weighIns = [],
  todayKey = '',
  unit = 'lbs',
  identity: propIdentity,
  chapter: propChapter = 1,
  becomingScore: propScore = 0,
  initialTab = 'story',
  goals = null,
  mindProgress = null,
  wins = [],
  stateLogs = [],
  streak = 0,
  program = null,
  onJumpToWeek,
  onNavigate,
}: BecomingDetailsProps) {
  const insets = useSafeAreaInsets()
  const { colors, tint, isDark } = useThemeTokens()
  const [tab, setTab] = useState<DetailsTab>(initialTab)
  const [trainView, setTrainView] = useState<TrainView>('week')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [allWeeks, setAllWeeks] = useState(false)
  const [allWins, setAllWins] = useState(false)

  const chapter = propChapter
  const score = propScore
  const identity = propIdentity
  const currentCh = CHAPTERS[chapter - 1]
  const nextCh = chapter < 5 ? CHAPTERS[chapter] : null
  const xpProgress = mindProgress?.xpProgress ?? null

  // "Then" for Mind — the earliest of: the oldest fetched state log, the
  // chapter placement, the oldest fetched win, or the oldest week on the
  // journey. Mirrors webapp's `sinceDate`.
  const sinceDate = useMemo(() => {
    const candidates: number[] = []
    if (stateLogs.length) {
      const oldest = stateLogs[stateLogs.length - 1]
      if (oldest) candidates.push(new Date(oldest.timestamp).getTime())
    }
    const firstChapter = mindProgress?.chapterHistory?.[0]?.unlockedAt
    if (firstChapter) candidates.push(new Date(firstChapter).getTime())
    if (wins.length) {
      const oldestWin = wins[wins.length - 1]
      if (oldestWin) candidates.push(new Date(oldestWin.date).getTime())
    }
    if (weeks.length) candidates.push(new Date(`${weeks[0]!.weekKey}T12:00:00Z`).getTime())
    return candidates.length ? Math.min(...candidates) : null
  }, [stateLogs, wins, mindProgress, weeks])

  // The last two weeks of state check-ins, oldest-first for the dot strip,
  // and the state that showed up most — "How you've shown up" and the Mind
  // "what next" both read from this same slice.
  const recentStates = useMemo(() => [...stateLogs].slice(0, 14).reverse(), [stateLogs])
  const dominantState = useMemo<MindState | null>(() => {
    if (!stateLogs.length) return null
    const counts: Partial<Record<MindState, number>> = {}
    for (const l of stateLogs.slice(0, 14)) counts[l.state] = (counts[l.state] ?? 0) + 1
    const [top] = Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    return (top?.[0] as MindState | undefined) ?? null
  }, [stateLogs])
  const lockedInPct = useMemo(() => {
    const recent = stateLogs.slice(0, 14)
    return recent.length ? Math.round((recent.filter((l) => l.state === 'locked_in').length / recent.length) * 100) : null
  }, [stateLogs])
  const focus = dominantState ? FOCUS_BY_STATE[dominantState] : null
  // Mind has no goal read of its own; the state pattern is its "what next",
  // deliberately `info` severity so it never outranks a real goal signal.
  const mindStep = useMemo<Suggestion | null>(
    () =>
      focus && dominantState
        ? { key: `mind.${dominantState}`, title: focus.title, sub: focus.sub, severity: 'info', url: '/dashboard/mind' }
        : null,
    [focus, dominantState],
  )

  // Fuel derivations
  const n = goals?.nutrition
  const t = goals?.training
  const tWeek = t?.week ?? null
  const tUnit: 'lbs' | 'kg' = (t?.unit as 'lbs' | 'kg') ?? unit
  // Training's "Next" sub — the active program and how far through it, same
  // formula as webapp's `progPct`.
  const progPct =
    program && program.totalWorkouts && program.completedWorkouts != null
      ? Math.round((program.completedWorkouts / program.totalWorkouts) * 100)
      : program
        ? Math.round((program.currentWeek / (program.totalWeeks || 1)) * 100)
        : null

  // Story derivations
  const prTimeline = useMemo(
    () =>
      weeks
        .flatMap((w) => w.training.prs.map((p) => ({ ...p, week: w })))
        .reverse()
        .slice(0, 12),
    [weeks],
  )
  const weeksDesc = useMemo(() => [...weeks].reverse(), [weeks])
  const thisWeek: WeekSnapshot | null = weeks.length ? (weeks[weeks.length - 1] ?? null) : null

  const summary = useMemo(
    () =>
      summarizeWeek({
        week: thisWeek,
        unit,
        loadUnit: tUnit,
        training: tWeek,
        streak,
        suggestions: { training: t?.suggestion, fuel: n?.suggestion, mind: mindStep },
      }),
    [thisWeek, unit, tUnit, tWeek, streak, t?.suggestion, n?.suggestion, mindStep],
  )

  const weekList = previewList(weeksDesc, allWeeks)
  // The evidence wall reads the wins fetched directly (real dates, real ids),
  // same source as webapp — not the journey's per-week win strings.
  const winList = previewList(wins, allWins)

  const handleLinkPress = (url: string) => {
    onClose()
    onNavigate?.(url)
  }

  return (
    <Modal visible={open} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerKicker, { color: colors['muted-foreground'] }]}>The Becoming</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Details</Text>
          </View>
          <Pressable
            style={[minTouchTarget, styles.closeBtn, { backgroundColor: tint('muted', 0.5) }]}
            onPress={onClose}
            accessibilityLabel="Close details"
            accessibilityRole="button"
          >
            <X size={20} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Tabs Bar */}
        <View style={[styles.tabsRow, { backgroundColor: tint('muted', 0.4) }]} role="tablist">
          {TABS.map((tb) => {
            const on = tb.id === tab
            const Icon = tb.Icon
            return (
              <Pressable
                key={tb.id}
                onPress={() => setTab(tb.id)}
                testID={`details-tab-${tb.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[
                  minTouchTarget,
                  styles.tabBtn,
                  on ? { backgroundColor: colors.card } : undefined,
                ]}
              >
                <Icon size={16} color={on ? tb.hue : colors['muted-foreground']} />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: on ? colors.foreground : colors['muted-foreground'] },
                  ]}
                >
                  {tb.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Content Screens */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
          ]}
          testID={`details-screen-${tab}`}
        >
          {/* ── STORY SCREEN ── */}
          {tab === 'story' && (
            <View style={styles.tabContent}>
              {/* Summary card */}
              <Glass hue="hsl(258, 90%, 76%)" testID="story-summary">
                <View style={styles.cardHeaderRow}>
                  <Eyebrow>{summary.live ? 'This week' : 'That week'}</Eyebrow>
                  <Text style={[styles.cardHeaderDate, { color: colors['muted-foreground'] }]}>{summary.label}</Text>
                </View>
                <Text style={[styles.summaryHeadline, { color: colors.foreground }]}>{summary.headline}</Text>
                <Text style={[styles.summarySub, { color: colors['muted-foreground'] }]}>{summary.sub}</Text>

                {summary.lines.length > 0 && (
                  <View style={styles.summaryLinesWrap}>
                    {summary.lines.map((l) => (
                      <View
                        key={l.pillar}
                        testID={`story-summary-${l.pillar}`}
                        style={styles.summaryLineRow}
                      >
                        <Text
                          style={[
                            styles.summaryLineLabel,
                            { color: SUMMARY_HUE[l.pillar] },
                          ]}
                        >
                          {l.label}
                        </Text>
                        <Text style={[styles.summaryLineFacts, { color: colors.foreground }]}>
                          {l.facts.join(' · ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Glass>

              {/* What to do next */}
              {summary.next.length > 0 && (
                <View testID="story-next" style={{ gap: 8 }}>
                  <Eyebrow>What to do next</Eyebrow>
                  {summary.next.map((st, sIdx) => (
                    <NextCard
                      key={st.suggestion.key ?? `st-${sIdx}`}
                      title={st.suggestion.title}
                      sub={st.suggestion.sub}
                      url={st.suggestion.url}
                      hue={SUMMARY_HUE[st.pillar]}
                      onPress={handleLinkPress}
                    />
                  ))}
                </View>
              )}

              {/* Week by week */}
              {weeksDesc.length > 0 && (
                <Glass>
                  <Eyebrow>Week by week</Eyebrow>
                  <View style={{ gap: 6 }}>
                    {weekList.shown.map((w) => (
                      <Pressable
                        key={w.weekKey}
                        onPress={() => {
                          onClose()
                          onJumpToWeek?.(w.weekKey)
                        }}
                        testID="details-week-row"
                        style={styles.weekRow}
                        accessibilityRole="button"
                        accessibilityLabel={`Week of ${w.label}: ${w.headline}`}
                      >
                        <View
                          style={[
                            styles.weekIndicator,
                            { backgroundColor: weekColor(w.subject, w.score, 60) },
                          ]}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.weekRowHeadline, { color: colors.foreground }]} numberOfLines={1}>
                            {w.headline}
                          </Text>
                          <Text style={[styles.weekRowSub, { color: colors['muted-foreground'] }]} numberOfLines={1}>
                            {w.isCurrent
                              ? 'this week'
                              : w.gap
                                ? `${w.label} · away ${w.gap.weeks} wks`
                                : w.label}
                            {w.tags.length ? ` · ${w.tags.slice(0, 3).join(' · ')}` : ''}
                          </Text>
                        </View>
                        <ArrowRight size={14} color={colors['muted-foreground']} />
                      </Pressable>
                    ))}
                  </View>
                  {weekList.hidden > 0 && (
                    <MoreButton
                      open={allWeeks}
                      onClick={() => setAllWeeks((v) => !v)}
                      testId="details-weeks-more"
                      label={`Show ${weekList.hidden} more week${weekList.hidden === 1 ? '' : 's'}`}
                    />
                  )}
                </Glass>
              )}

              {/* Evidence wall */}
              <Glass hue="hsl(258, 90%, 76%)">
                <Eyebrow>Evidence wall</Eyebrow>
                {wins.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors['muted-foreground'] }]}>
                    No wins banked yet. Bank one in a session — the proof that you’re changing builds here.
                  </Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {winList.shown.map((w, idx) => (
                      <View key={w._id ?? `win-${idx}`} style={styles.evidenceRow}>
                        <View
                          style={[
                            styles.evidenceDot,
                            {
                              backgroundColor: isDark
                                ? 'hsl(258, 90%, 80%)'
                                : 'hsl(258, 90%, 50%)',
                            },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.evidenceQuote, { color: colors.foreground }]}>“{w.win}”</Text>
                          <Text style={[styles.evidenceDate, { color: colors['muted-foreground'] }]}>{relDay(w.date)}</Text>
                        </View>
                      </View>
                    ))}
                    {winList.hidden > 0 && (
                      <MoreButton
                        open={allWins}
                        onClick={() => setAllWins((v) => !v)}
                        testId="details-wins-more"
                        label={`Show ${winList.hidden} more win${winList.hidden === 1 ? '' : 's'}`}
                      />
                    )}
                  </View>
                )}
              </Glass>
            </View>
          )}

          {/* ── TRAINING SCREEN ── */}
          {tab === 'training' && (
            <View style={styles.tabContent}>
              {/* Sub switch */}
              <View style={[styles.subSwitch, { backgroundColor: tint('muted', 0.4) }]} testID="training-subswitch">
                <Pressable
                  onPress={() => setTrainView('week')}
                  testID="training-subswitch-week"
                  style={[
                    minTouchTarget,
                    styles.subSwitchBtn,
                    trainView === 'week' && { backgroundColor: colors.card },
                  ]}
                  accessibilityRole="tab"
                  accessibilityLabel="This week"
                >
                  <Text
                    style={[
                      styles.subSwitchText,
                      { color: trainView === 'week' ? colors.foreground : colors['muted-foreground'] },
                    ]}
                  >
                    This week
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTrainView('strength')}
                  testID="training-subswitch-strength"
                  style={[
                    minTouchTarget,
                    styles.subSwitchBtn,
                    trainView === 'strength' && { backgroundColor: colors.card },
                  ]}
                  accessibilityRole="tab"
                  accessibilityLabel="Strength"
                >
                  <Text
                    style={[
                      styles.subSwitchText,
                      { color: trainView === 'strength' ? colors.foreground : colors['muted-foreground'] },
                    ]}
                  >
                    Strength
                  </Text>
                </Pressable>
              </View>

              {trainView === 'week' ? (
                <>
                  <Glass hue={SUBJECT.training.hsl}>
                    <View style={styles.cardHeaderRow}>
                      <Eyebrow>The week</Eyebrow>
                      {t?.target.daysPerWeek ? (
                        <Text
                          style={[
                            styles.badgeText,
                            { color: t.thisWeek?.weekLost ? colors.accent : colors.success },
                          ]}
                        >
                          This week {t.thisWeek?.done ?? 0}/{t.target.daysPerWeek}
                          {t.thisWeek?.weekLost ? ' · off track' : t.thisWeek?.remaining === 0 ? ' · done' : ''}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.cellsRow}>
                      <Cell
                        label="Then"
                        value={
                          t?.baseline?.prs?.length
                            ? `${t.baseline.prs.length} lifts`
                            : t?.startedAt
                              ? fmtDate(t.startedAt)
                              : '—'
                        }
                        sub={t?.baseline?.date ? `PRs on ${fmtDate(t.baseline.date)}` : 'baseline'}
                      />
                      <Cell
                        label="Now"
                        value={t?.avgLast4 != null ? `${t.avgLast4}/wk` : '—'}
                        sub="avg, last 4 wks"
                        hue={SUBJECT.training.hsl}
                      />
                      <Cell
                        label="Next"
                        value={t?.target?.daysPerWeek ? `${t.target.daysPerWeek}/wk` : '—'}
                        sub={program && progPct != null ? `${program.name} · ${progPct}%` : 'your target'}
                      />
                    </View>
                  </Glass>

                  {tWeek && tWeek.sessions > 0 && (
                    <Glass hue={SUBJECT.training.hsl}>
                      <Eyebrow>What you moved</Eyebrow>
                      <View style={styles.cellsRow}>
                        <Cell
                          label="Sessions"
                          value={String(tWeek.sessions)}
                          sub={tWeek.exercises ? `${tWeek.exercises} exercises` : undefined}
                          hue={SUBJECT.training.hsl}
                        />
                        <Cell
                          label="Sets"
                          value={String(tWeek.sets)}
                          sub={tWeek.reps ? `${tWeek.reps} reps` : undefined}
                        />
                        <Cell
                          label="Load moved"
                          value={
                            tWeek.hasWeightedWork
                              ? formatVolume(tWeek.volume, tUnit)
                              : formatWorkTime(tWeek.workSeconds)
                          }
                          sub={tWeek.hasWeightedWork ? 'weight × reps' : 'time under load'}
                        />
                      </View>
                      {tWeek.topSet && (
                        <Text style={[styles.bestSetText, { color: colors['muted-foreground'] }]}>
                          Best set:{' '}
                          <Text style={{ color: colors.foreground, fontWeight: '600' }}>
                            {tWeek.topSet.name}
                          </Text>{' '}
                          {tWeek.topSet.weight} {tUnit} × {tWeek.topSet.reps}
                        </Text>
                      )}
                    </Glass>
                  )}

                  {t?.suggestion && (
                    <NextCard
                      title={t.suggestion.title}
                      sub={t.suggestion.sub}
                      url={t.suggestion.url}
                      hue={SUBJECT.training.hsl}
                      onPress={handleLinkPress}
                    />
                  )}
                </>
              ) : (
                <>
                  <Glass hue={SUBJECT.training.hsl}>
                    <View style={styles.cardHeaderRow}>
                      <Eyebrow>Your lifts</Eyebrow>
                      <Pressable
                        onPress={() => setSheet({ kind: 'metric' })}
                        testID="details-what-is-est-max"
                        style={[minTouchTarget, styles.helpPill, { backgroundColor: tint('muted', 0.4) }]}
                        accessibilityRole="button"
                        accessibilityLabel="What is estimated 1RM?"
                      >
                        <HelpCircle size={12} color={colors['muted-foreground']} />
                        <Text style={[styles.helpPillText, { color: colors['muted-foreground'] }]}>{EST_MAX_LABEL_SHORT}?</Text>
                      </Pressable>
                    </View>

                    {t?.lifts && t.lifts.length > 0 ? (
                      <View style={{ gap: 6 }}>
                        {t.lifts.slice(0, 5).map((l) => {
                          const hasTarget = l.target != null
                          return (
                            <Pressable
                              key={l.slug}
                              testID="details-lift-target"
                              onPress={() => {
                                if (hasTarget) {
                                  setSheet({
                                    kind: 'target',
                                    slug: l.slug,
                                    name: l.name,
                                    current: l.now,
                                    target: l.target as number,
                                    reached: !!l.reached,
                                  })
                                }
                              }}
                              style={styles.liftRow}
                              accessibilityRole="button"
                              accessibilityLabel={`${l.name}: current ${l.now}${hasTarget ? `, target ${l.target}` : ''}`}
                            >
                              <Text style={[styles.liftName, { color: colors.foreground }]} numberOfLines={1}>
                                {l.name}
                              </Text>
                              <View style={styles.liftRight}>
                                <Text style={[styles.liftNumbers, { color: colors['muted-foreground'] }]}>
                                  {l.then} → <Text style={{ color: colors.foreground, fontWeight: '700' }}>{l.now}</Text>
                                  {hasTarget && (
                                    l.reached ? (
                                      <Text style={{ color: colors.success }}> reached ✓</Text>
                                    ) : (
                                      <Text style={{ color: SUBJECT.training.hsl }}> → {l.target}</Text>
                                    )
                                  )}
                                </Text>
                                {hasTarget && <Info size={12} color={colors['muted-foreground']} />}
                              </View>
                            </Pressable>
                          )
                        })}
                      </View>
                    ) : (
                      <Text style={[styles.emptyText, { color: colors['muted-foreground'] }]}>
                        Log a few weighted sets and your lifts show up here, with an {EST_MAX_LABEL.toLowerCase()} for each.
                      </Text>
                    )}
                  </Glass>

                  {prTimeline.length > 0 && (
                    <Glass hue="hsl(43, 96%, 56%)">
                      <Eyebrow>Records</Eyebrow>
                      <View style={{ gap: 6 }}>
                        {prTimeline.slice(0, 6).map((p, i) => (
                          <Pressable
                            key={i}
                            onPress={() => {
                              onClose()
                              onJumpToWeek?.(p.week.weekKey)
                            }}
                            style={styles.recordRow}
                            accessibilityRole="button"
                            accessibilityLabel={`${p.name}: ${p.e1RM} ${tUnit} in ${p.week.label}`}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Trophy size={14} color={colors.accent} />
                              <Text style={[styles.recordName, { color: colors.foreground }]} numberOfLines={1}>
                                {p.name}
                              </Text>
                            </View>
                            <Text style={[styles.recordMeta, { color: colors['muted-foreground'] }]}>
                              {p.e1RM} {tUnit} · {p.week.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </Glass>
                  )}
                </>
              )}
            </View>
          )}

          {/* ── FUEL SCREEN ── */}
          {tab === 'fuel' && (
            <View style={styles.tabContent}>
              {weighIns.length > 0 && (
                <Glass hue={SUBJECT.fuel.hsl}>
                  <WeightChart
                    weighIns={weighIns}
                    target={n?.target.weight ?? null}
                    unit={unit}
                    todayKey={todayKey}
                    direction={n?.direction ?? null}
                  />
                </Glass>
              )}

              <Glass hue={SUBJECT.fuel.hsl} testID="weight-plan">
                <View style={styles.cardHeaderRow}>
                  <Eyebrow>Weight plan</Eyebrow>
                  {n?.pace && n.status === 'active' && n.pace.status !== 'done' ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: n.pace.status === 'behind' ? colors.accent : colors.success,
                      }}
                    >
                      {n.pace.status === 'behind'
                        ? `${fmtUnit(n.pace.behindByKg, unit)} behind pace`
                        : n.pace.status === 'ahead'
                          ? `${fmtUnit(n.pace.aheadByKg, unit)} ahead`
                          : n.pace.status === 'on'
                            ? 'On pace'
                            : ''}
                    </Text>
                  ) : null}
                  {readReached(n?.status, n?.pace?.status) === 'reached' ? (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>
                      Reached ✓
                    </Text>
                  ) : null}
                  {readReached(n?.status, n?.pace?.status) === 'at-goal' ? (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>
                      At goal · hold a week
                    </Text>
                  ) : null}
                </View>

                {n?.target.weight ? (
                  <>
                    <View style={styles.cellsRow}>
                      <Cell
                        label="Then"
                        value={n.baseline?.weight != null ? `${Math.round(n.baseline.weight)} ${unit}` : '—'}
                        sub={n.baseline?.date ? `plan from ${fmtDate(n.baseline.date)}` : undefined}
                      />
                      <Cell
                        label="Now"
                        value={n.now?.weight != null ? `${Math.round(n.now.weight)} ${unit}` : '—'}
                        sub={
                          n.now?.fourWeeksAgo != null && n.now?.weight != null
                            ? `${
                                n.now.weight - n.now.fourWeeksAgo <= -0.05
                                  ? '↓'
                                  : n.now.weight - n.now.fourWeeksAgo >= 0.05
                                    ? '↑'
                                    : '→'
                              } ${Math.abs(n.now.weight - n.now.fourWeeksAgo).toFixed(1)} in 4 wks`
                            : n.now?.date
                              ? fmtDayMarker(n.now.date)
                              : undefined
                        }
                        hue={SUBJECT.fuel.hsl}
                      />
                      <Cell
                        label="Next"
                        value={`${Math.round(n.target.weight)} ${unit}`}
                        sub={
                          n.pace?.etaDate
                            ? `${n.pace.eta} → ${fmtDate(n.pace.etaDate)}`
                            : n.direction === 'maintain'
                              ? 'hold ±2'
                              : n.target.pacePerWeek
                                ? `${n.target.pacePerWeek} ${unit}/wk`
                                : undefined
                        }
                      />
                    </View>

                    {n.journeyStart.weight != null &&
                      n.journeyStart.date &&
                      n.baseline?.date &&
                      new Date(n.journeyStart.date) < new Date(n.baseline.date) && (
                        <Text style={[styles.firstWeighInText, { color: colors['muted-foreground'] }]}>
                          First weigh-in {Math.round(n.journeyStart.weight)} {unit} on {fmtDayMarker(n.journeyStart.date)}.
                        </Text>
                      )}

                    {n.adherence && (
                      <View style={styles.adherenceRow}>
                        <View style={[styles.adherenceChip, { backgroundColor: tint('muted', 0.3) }]}>
                          {n.adherence.logOk ? <Check size={12} color={colors.success} /> : <Minus size={12} color={colors['muted-foreground']} />}
                          <Text style={[styles.adherenceText, { color: colors.foreground }]}>
                            Logged {n.adherence.logDays}/{n.adherence.totalDays} days{' '}
                            <Text style={{ color: colors['muted-foreground'] }}>(aim {n.adherence.logTarget})</Text>
                          </Text>
                        </View>
                        {n.adherence.proteinJudged && (
                          <View style={[styles.adherenceChip, { backgroundColor: tint('muted', 0.3) }]}>
                            {n.adherence.proteinOk ? <Check size={12} color={colors.success} /> : <Minus size={12} color={colors['muted-foreground']} />}
                            <Text style={[styles.adherenceText, { color: colors.foreground }]}>
                              Protein hit {n.adherence.proteinDays}/{n.adherence.totalDays}{' '}
                              <Text style={{ color: colors['muted-foreground'] }}>
                                (aim {n.adherence.proteinTarget}{n.proteinGoal ? ` · ${n.proteinGoal}g` : ''})
                              </Text>
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={[styles.emptyText, { color: colors['muted-foreground'] }]}>
                    No target weight yet — set one in Settings and this becomes then → now → next.
                  </Text>
                )}
              </Glass>

              {n?.suggestion && (
                <NextCard
                  title={n.suggestion.title}
                  sub={n.suggestion.sub}
                  url={n.suggestion.url}
                  hue={SUBJECT.fuel.hsl}
                  onPress={handleLinkPress}
                />
              )}

              <Pressable
                onPress={() => handleLinkPress('/dashboard/nutrition/goals')}
                style={[styles.linkRow, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]}
                accessibilityRole="button"
              >
                <Text style={[styles.linkRowText, { color: colors.foreground }]}>Pace, targets and macros</Text>
                <ArrowRight size={18} color={colors['muted-foreground']} />
              </Pressable>
            </View>
          )}

          {/* ── MIND SCREEN ── */}
          {tab === 'mind' && (
            <View style={styles.tabContent}>
              {/* Score banner */}
              <View
                style={[
                  styles.scoreBanner,
                  {
                    backgroundColor: isDark ? 'hsl(258, 45%, 22%)' : 'hsl(258, 80%, 94%)',
                    borderWidth: 1,
                    borderColor: isDark ? 'hsl(258, 80%, 65%)' : 'hsl(258, 80%, 55%)',
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text
                      style={[
                        styles.scoreKicker,
                        { color: isDark ? 'hsl(258, 90%, 80%)' : 'hsl(258, 90%, 45%)' },
                      ]}
                    >
                      Becoming score
                    </Text>
                    <Text style={[styles.scoreNumber, { color: colors.foreground }]}>{score.toLocaleString()}</Text>
                  </View>
                  {streak > 0 && (
                    <View style={[styles.streakTile, { backgroundColor: tint('muted', 0.3) }]} testID="mind-streak">
                      <Flame size={20} color={STREAK_INK.day.hsl} />
                      <Text style={[styles.streakNumber, { color: colors.foreground }]}>{streak}</Text>
                      <Text style={[styles.streakLabel, { color: colors['muted-foreground'] }]}>day streak</Text>
                    </View>
                  )}
                </View>
                {identity ? (
                  <Text style={[styles.scoreIdentity, { color: colors.foreground }]}>“{identity}”</Text>
                ) : null}
              </View>

              <View style={styles.cellsRow}>
                <Cell label="Then" value={sinceDate ? fmtDate(sinceDate) : '—'} sub="where you started" />
                <Cell label="Now" value={`Ch ${chapter} · ${currentCh?.name ?? 'Reset'}`} sub={currentCh?.theme} hue={SUBJECT.mind.hsl} />
                <Cell label="Next" value={nextCh ? nextCh.name : 'Architect+'} sub={nextCh ? nextCh.theme : 'keep building'} />
              </View>

              <Glass hue={SUBJECT.mind.hsl}>
                <Eyebrow>The arc</Eyebrow>
                <View style={{ gap: 6 }}>
                  {CHAPTERS.map((c) => {
                    const done = c.id < chapter
                    const active = c.id === chapter
                    const locked = c.id > chapter
                    return (
                      <View
                        key={c.id}
                        style={[
                          styles.arcRow,
                          active ? { backgroundColor: tint('muted', 0.3) } : undefined,
                        ]}
                      >
                        <View
                          style={[
                            styles.arcBadge,
                            {
                              backgroundColor: done ? colors.success : active ? SUBJECT.mind.hsl : tint('muted', 0.5),
                            },
                          ]}
                        >
                          {locked ? (
                            <Lock size={12} color={colors['muted-foreground']} />
                          ) : (
                            <Text style={[styles.arcBadgeText, { color: colors.background }]}>{c.id}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.arcTitle, { color: locked ? colors['muted-foreground'] : colors.foreground }]}>
                            {c.name}
                          </Text>
                          <Text style={[styles.arcSub, { color: colors['muted-foreground'] }]} numberOfLines={1}>{c.theme}</Text>
                        </View>
                        {active && xpProgress && (
                          <Text style={[styles.arcPct, { color: colors['muted-foreground'] }]}>{xpProgress.pct}%</Text>
                        )}
                        {done && <Check size={16} color={colors.success} />}
                      </View>
                    )
                  })}
                </View>
              </Glass>

              {recentStates.length > 0 && (
                <Glass testID="mind-shown-up">
                  <View style={styles.cardHeaderRow}>
                    <Eyebrow>How you’ve shown up</Eyebrow>
                    {lockedInPct !== null && (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>
                        {lockedInPct}% locked in
                      </Text>
                    )}
                  </View>
                  <View style={styles.moodDotsRow}>
                    {recentStates.map((l, i) => (
                      <View
                        key={i}
                        style={[styles.moodDot, { backgroundColor: colors[STATE_META[l.state].dot] }]}
                      />
                    ))}
                  </View>
                  <View style={styles.legendRow}>
                    {(Object.keys(STATE_META) as MindState[]).map((s) => (
                      <View key={s} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors[STATE_META[s].dot] }]} />
                        <Text style={[styles.legendText, { color: colors['muted-foreground'] }]}>{STATE_META[s].label}</Text>
                      </View>
                    ))}
                  </View>
                </Glass>
              )}

              {focus && (
                <NextCard
                  title={focus.title}
                  sub={focus.sub}
                  url="/dashboard/mind"
                  hue={SUBJECT.mind.hsl}
                  onPress={handleLinkPress}
                />
              )}

              {nextCh && (
                <Pressable
                  onPress={() => handleLinkPress('/dashboard/mind')}
                  style={[styles.linkRow, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Next: {nextCh.name}</Text>
                    <Text style={[styles.linkRowSub, { color: colors['muted-foreground'] }]} numberOfLines={1}>
                      Unlocks {nextCh.systems.map((s: string) => SYSTEM_INFO[s]?.label ?? s).join(', ')}
                    </Text>
                  </View>
                  <ArrowRight size={18} color={colors['muted-foreground']} />
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>

        <StrengthTargetSheet
          open={!!sheet}
          onClose={() => setSheet(null)}
          hue={SUBJECT.training.hsl}
          unit={tUnit}
          lift={
            sheet?.kind === 'target'
              ? {
                  slug: sheet.slug,
                  name: sheet.name,
                  e1RM: sheet.current,
                  target: sheet.target,
                  targetJustification: null,
                }
              : null
          }
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerKicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  scrollContent: {
    gap: 12,
  },
  tabContent: {
    gap: 12,
  },
  glass: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  cardHeaderDate: {
    fontSize: 11,
  },
  summaryHeadline: {
    fontSize: 16,
    fontWeight: '800',
  },
  summarySub: {
    fontSize: 12,
  },
  summaryLinesWrap: {
    gap: 6,
    marginTop: 6,
  },
  summaryLineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  summaryLineLabel: {
    width: 60,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryLineFacts: {
    flex: 1,
    fontSize: 13,
  },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  nextCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  nextCardSub: {
    fontSize: 11,
    marginTop: 2,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  weekIndicator: {
    width: 5,
    height: 32,
    borderRadius: 3,
  },
  weekRowHeadline: {
    fontSize: 13,
    fontWeight: '700',
  },
  weekRowSub: {
    fontSize: 11,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  moreBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  evidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  evidenceQuote: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  evidenceDate: {
    fontSize: 10,
    marginTop: 2,
  },
  subSwitch: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 2,
  },
  subSwitchBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
  },
  subSwitchText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cellsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  cellLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cellValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  cellSub: {
    fontSize: 10,
    marginTop: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bestSetText: {
    fontSize: 11,
  },
  helpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  helpPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  liftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  liftName: {
    fontSize: 12,
    flex: 1,
  },
  liftRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liftNumbers: {
    fontSize: 11,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  recordName: {
    fontSize: 12,
  },
  recordMeta: {
    fontSize: 11,
  },
  adherenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  adherenceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  adherenceText: {
    fontSize: 11,
  },
  scoreBanner: {
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  scoreKicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '900',
  },
  scoreIdentity: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  arcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  arcBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  arcTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  arcSub: {
    fontSize: 11,
  },
  arcPct: {
    fontSize: 12,
    fontWeight: '600',
  },
  streakTile: {
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  streakNumber: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  streakLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moodDotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  moodDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  linkRowText: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkRowSub: {
    fontSize: 11,
    marginTop: 2,
  },
  firstWeighInText: {
    fontSize: 11,
    marginTop: 2,
  },
})

export default BecomingDetails
