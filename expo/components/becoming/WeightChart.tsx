import React, { useMemo, useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { Text } from '@/components/Text'
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg'
import {
  buildWeightSeries,
  weightCaption,
  type WeighIn,
  type WeightView,
  type ChartPoint,
} from '@/lib/becoming/weightSeries'
import { PILLAR } from '@/lib/becoming/pillarColors'
import { minTouchTarget } from '@/lib/a11y/touchTarget'
import { useThemeTokens } from '@/lib/theme/useThemeTokens'

const W = 320
const H = 130
const L = 32
const R = 10
const T = 12
const B = 22

export interface WeightChartProps {
  weighIns: WeighIn[]
  target: number | null
  unit: 'lbs' | 'kg'
  todayKey: string
  direction: 'lose' | 'maintain' | 'gain' | null
}

export function WeightChart({
  weighIns,
  target,
  unit,
  todayKey,
  direction,
}: WeightChartProps) {
  const { colors, tint } = useThemeTokens()
  const [view, setView] = useState<WeightView>('week')
  const [selectedPoint, setSelectedPoint] = useState<ChartPoint | null>(null)

  const s = useMemo(
    () => buildWeightSeries(weighIns, view, target, todayKey),
    [weighIns, view, target, todayKey],
  )

  const good =
    direction === 'lose'
      ? (s.delta ?? 0) < 0
      : direction === 'gain'
        ? (s.delta ?? 0) > 0
        : Math.abs(s.delta ?? 0) < 1

  const px = (x: number) => L + x * (W - L - R)
  const py = (y: number) => T + y * (H - T - B)

  const linePath = useMemo(() => {
    if (s.points.length === 0) return ''
    return s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`)
      .join(' ')
  }, [s.points])

  const areaPath = useMemo(() => {
    if (s.points.length <= 1) return ''
    const last = s.points[s.points.length - 1]
    const first = s.points[0]
    if (!last || !first) return ''
    return `${linePath} L ${px(last.x).toFixed(1)} ${H - B} L ${px(first.x).toFixed(1)} ${H - B} Z`
  }, [linePath, s.points])

  const hue = PILLAR.fuel.hsl

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors['muted-foreground'] }]}>WEIGHT</Text>
        <View style={[styles.switchRow, { backgroundColor: tint('muted', 0.5) }]} role="tablist">
          <Pressable
            style={[
              minTouchTarget,
              styles.switchBtn,
              view === 'week' && { backgroundColor: colors.card },
            ]}
            onPress={() => { setView('week'); setSelectedPoint(null) }}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'week' }}
          >
            <Text
              style={[
                styles.switchText,
                { color: view === 'week' ? colors.foreground : colors['muted-foreground'] },
              ]}
            >
              Week
            </Text>
          </Pressable>
          <Pressable
            style={[
              minTouchTarget,
              styles.switchBtn,
              view === 'all' && { backgroundColor: colors.card },
            ]}
            onPress={() => { setView('all'); setSelectedPoint(null) }}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'all' }}
          >
            <Text
              style={[
                styles.switchText,
                { color: view === 'all' ? colors.foreground : colors['muted-foreground'] },
              ]}
            >
              All time
            </Text>
          </Pressable>
        </View>
      </View>

      {selectedPoint && (
        <View style={[styles.readout, { backgroundColor: tint('muted', 0.3) }]}>
          <Text style={[styles.readoutText, { color: colors['muted-foreground'] }]}>
            {selectedPoint.longLabel}:{' '}
            <Text style={{ fontWeight: '700', color: hue }}>
              {selectedPoint.value} {unit}
            </Text>
          </Text>
        </View>
      )}

      <View style={styles.svgWrapper}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <LinearGradient id="fuelFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={hue} stopOpacity="0.25" />
              <Stop offset="100%" stopColor={hue} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {s.yTicks.map((t, idx) => (
            <Line
              key={`grid-${idx}`}
              x1={L}
              y1={py(t.y ?? 0)}
              x2={W - R}
              y2={py(t.y ?? 0)}
              stroke={colors.border}
              strokeWidth={1}
            />
          ))}

          {/* Y tick labels */}
          {s.yTicks.map((t, idx) => (
            <SvgText
              key={`label-${idx}`}
              x={L - 4}
              y={py(t.y ?? 0) + 3}
              fontSize={9}
              textAnchor="end"
              fill={colors['muted-foreground']}
            >
              {t.label}
            </SvgText>
          ))}

          {/* Target line */}
          {s.targetY != null && (
            <Line
              x1={L}
              y1={py(s.targetY)}
              x2={W - R}
              y2={py(s.targetY)}
              stroke={colors.success}
              strokeDasharray="5 5"
              strokeWidth={1.5}
            />
          )}

          {/* Target label */}
          {s.targetY != null && (
            <SvgText
              x={W - R}
              y={py(s.targetY) - 4}
              fontSize={9}
              fontWeight="600"
              textAnchor="end"
              fill={colors.success}
            >
              goal {Math.round(target as number)}
            </SvgText>
          )}

          {/* Area fill */}
          {areaPath ? <Path d={areaPath} fill="url(#fuelFill)" /> : null}

          {/* Main line */}
          {linePath ? (
            <Path
              d={linePath}
              fill="none"
              stroke={hue}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* X ticks */}
          {s.xTicks.map((t, idx) => (
            <SvgText
              key={`xtick-${idx}`}
              x={px(t.x ?? 0)}
              y={H - 6}
              fontSize={9}
              textAnchor="middle"
              fill={colors['muted-foreground']}
            >
              {t.label}
            </SvgText>
          ))}

          {/* Data points */}
          {s.points.map((p) => {
            const isSelected = selectedPoint?.day === p.day
            return (
              <Circle
                key={p.day}
                cx={px(p.x)}
                cy={py(p.y)}
                r={isSelected ? 5 : 3}
                fill={isSelected ? colors.foreground : hue}
                stroke={hue}
                strokeWidth={isSelected ? 2 : 1}
                onPress={() => setSelectedPoint(p)}
              />
            )
          })}
        </Svg>
      </View>

      {/* Footer */}
      <View style={styles.footerRow} testID="weight-caption">
        {selectedPoint ? (
          <Text style={[styles.footerText, { color: colors.foreground, fontWeight: '700' }]}>
            {selectedPoint.longLabel} · {selectedPoint.value.toFixed(1)} {unit}
          </Text>
        ) : (
          <>
            <Text style={[styles.footerText, { color: colors['muted-foreground'] }]}>
              {s.first ? `${s.first.label} · ${Math.round(s.first.value)} ${unit}` : ''}
            </Text>
            <Text
              style={[
                styles.footerText,
                {
                  color: good ? colors.success : colors['muted-foreground'],
                  fontWeight: good ? '700' : '500',
                },
              ]}
            >
              {weightCaption(s, unit)}
            </Text>
            <Text style={[styles.footerText, { color: colors['muted-foreground'] }]}>
              {Math.round(s.last?.value ?? 0)} {unit} · now
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  footerText: {
    fontSize: 11,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  switchBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  switchText: {
    fontSize: 10,
    fontWeight: '600',
  },
  readout: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  readoutText: {
    fontSize: 11,
  },
  svgWrapper: {
    width: '100%',
    alignItems: 'center',
  },
})

export default WeightChart
