import React from 'react'
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native'
import { Text } from '@/components/Text'
import { X, Trophy, Check, Info } from 'lucide-react-native'
import type { LiftProgress } from '@/lib/becoming/types'
import { minTouchTarget } from '@/lib/a11y/touchTarget'
import { useThemeTokens } from '@/lib/theme/useThemeTokens'

// Mirrors webapp/lib/strength/language.ts#EST_MAX_LABEL(_SHORT). Native used
// to say "Estimated 1RM" / "Est 1RM" here, which read as a different metric
// from the web's "Estimated max" / "Est. max" copy (NP-335).
export const EST_MAX_LABEL = 'Estimated max'
export const EST_MAX_LABEL_SHORT = 'Est. max'

export interface StrengthTargetSheetProps {
  open: boolean
  onClose: () => void
  lift: LiftProgress | null
  unit?: 'lbs' | 'kg'
  hue?: string
}

export function StrengthTargetSheet({
  open,
  onClose,
  lift,
  unit = 'lbs',
  hue = 'hsl(142, 71%, 58%)',
}: StrengthTargetSheetProps) {
  const { colors, tint, scrim } = useThemeTokens()
  if (!lift) return null

  const reached = lift.target ? lift.e1RM >= lift.target : false

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: scrim }]}
          onPress={onClose}
          accessibilityLabel="Dismiss sheet"
          accessibilityRole="button"
        />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: tint('muted', 0.5) }]}>
                {reached ? (
                  <Trophy size={18} color={colors.accent} />
                ) : (
                  <Info size={18} color={colors.accent} />
                )}
              </View>
              <View>
                <Text style={[styles.kicker, { color: colors['muted-foreground'] }]}>{EST_MAX_LABEL} & Target</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>{lift.name}</Text>
              </View>
            </View>
            <Pressable
              style={[minTouchTarget, styles.closeBtn, { backgroundColor: tint('muted', 0.5) }]}
              onPress={onClose}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 32 }}>
            <View style={styles.section}>
              <View style={[styles.targetCard, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]}>
                <View style={styles.metricRow}>
                  <View style={styles.metricBox}>
                    <Text style={[styles.metricLabel, { color: colors['muted-foreground'] }]}>Current best</Text>
                    <Text style={[styles.metricValue, { color: colors.foreground }]}>
                      {lift.e1RM} <Text style={{ fontSize: 13, fontWeight: '500', color: colors['muted-foreground'] }}>{unit}</Text>
                    </Text>
                  </View>

                  {lift.target ? (
                    <>
                      <Text style={{ color: colors['muted-foreground'], fontSize: 16 }}>→</Text>
                      <View style={styles.metricBox}>
                        <Text style={[styles.metricLabel, { color: colors['muted-foreground'] }]}>Target</Text>
                        <Text style={[styles.metricValue, { color: hue }]}>
                          {lift.target} <Text style={{ fontSize: 13, fontWeight: '500', color: colors['muted-foreground'] }}>{unit}</Text>
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>

                {reached && (
                  <View style={[styles.reachedPill, { backgroundColor: tint('success', 0.15) }]}>
                    <Check size={12} color={colors.success} />
                    <Text style={[styles.reachedText, { color: colors.success }]}>Target achieved</Text>
                  </View>
                )}
              </View>

              {lift.targetJustification ? (
                <View style={[styles.explanationBox, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]}>
                  <Text style={[styles.explanationKicker, { color: colors['muted-foreground'] }]}>Why this target</Text>
                  <Text style={[styles.explanationText, { color: colors.foreground }]}>{lift.targetJustification}</Text>
                </View>
              ) : null}

              <View style={[styles.explanationBox, { backgroundColor: tint('muted', 0.2), borderColor: colors.border }]}>
                <Text style={[styles.explanationKicker, { color: colors['muted-foreground'] }]}>How estimated max is calculated</Text>
                <Text style={[styles.bodyText, { color: colors['muted-foreground'] }]}>
                  Every working set gives a data point. When you lift a weight for multiple reps,
                  we calculate your one-rep maximum using the Brzycki equation:
                </Text>
                <View style={[styles.formulaCard, { backgroundColor: tint('muted', 0.4), borderColor: colors.border }]}>
                  <Text style={[styles.formulaText, { color: colors.accent }]}>Weight × (36 / (37 − Reps))</Text>
                </View>
                <Text style={[styles.bodyText, { color: colors['muted-foreground'] }]}>
                  Sets with fewer reps and high effort provide the most accurate signal. Your true
                  one-rep max may be slightly higher on test day.
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '75%',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 16,
  },
  section: {
    gap: 16,
  },
  targetCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metricBox: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  metricArrow: {
    paddingHorizontal: 4,
  },
  reachedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reachedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  explanationBox: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  explanationKicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 18,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  formulaCard: {
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  formulaText: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '600',
  },
})

export default StrengthTargetSheet
