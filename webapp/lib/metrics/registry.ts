// In-memory metric registry. Process-singleton; server-side only.
//
// Concrete metrics call registerMetric() at module load. Consumers
// (chart tiles, the suggestion engine, the AI coach feature builder)
// look them up via resolveMetric / listMetricsForDomain.
//
// No React, DOM, or Mongoose deps — safe to import from API routes,
// suggestion sources, and unit tests alike.

import type { Metric, MetricDomain } from './types'

const registry = new Map<string, Metric>()

export function registerMetric(metric: Metric): void {
  if (registry.has(metric.id)) {
    throw new Error(`Metric "${metric.id}" is already registered`)
  }
  registry.set(metric.id, metric)
}

export function resolveMetric(id: string): Metric | undefined {
  return registry.get(id)
}

export function listMetricsForDomain(domain: MetricDomain): Metric[] {
  const out: Metric[] = []
  for (const m of registry.values()) {
    if (m.domain === domain) out.push(m)
  }
  return out
}

export function listAllMetrics(): Metric[] {
  return Array.from(registry.values())
}

// Test-only: drop all registrations so suites can run in isolation.
export function __resetRegistryForTest(): void {
  registry.clear()
}
