// Drill-in stub. Real implementation lands in a follow-up — this exists
// today so the tile shells' tap-target links don't 404.

import Link from 'next/link'
import { resolveMetric } from '@/lib/metrics/registry'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ metricId: string }>
}

export default async function InsightsDrillInPage({ params }: PageProps) {
  const { metricId } = await params
  const metric = resolveMetric(metricId)

  return (
    <div
      data-testid="insights-drill-in"
      data-metric-id={metricId}
      className="mx-auto max-w-2xl px-4 py-6"
    >
      <Link
        href="/dashboard"
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-100">
        {metric ? metric.label : 'Unknown metric'}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        Metric id: <code className="font-mono">{metricId}</code>
      </p>
      <div className="mt-6 rounded-2xl bg-zinc-900/60 p-6 ring-1 ring-white/5">
        <p className="text-sm text-zinc-400">
          {metric
            ? 'Drill-in view coming soon. This stub exists so the tile shells’ tap-target links resolve.'
            : 'No metric is registered under this id. It may have been removed or renamed.'}
        </p>
      </div>
    </div>
  )
}
