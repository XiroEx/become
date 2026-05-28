// Metric primitive — Layer 1 of the intelligence platform.
//
// A Metric is a named, typed, time-series-producing function. The platform
// renders metrics through reusable chart tiles; the AI coach consumes them as
// numeric features. Concrete metrics live in lib/metrics/<domain>/*.ts and
// register themselves at module load via registerMetric() in registry.ts.

export type MetricDomain = 'workout' | 'nutrition' | 'mindset'

export type MetricTrendDirection = 'up-good' | 'down-good' | 'neutral'

export interface MetricWindow {
  start: Date
  end: Date
}

export interface DataPoint {
  t: Date
  value: number
  label?: string
}

export interface Metric {
  id: string
  label: string
  unit: string
  domain: MetricDomain
  trendDirection: MetricTrendDirection
  goalValue?: number
  compute: (userId: string, window: MetricWindow) => Promise<DataPoint[]>
}
