// Tile gallery (admin-only). Renders each of the 5 tile variants against
// a deterministic fixture metric so we can eyeball layout / colors / a11y
// without wiring real data through the dashboard rotator yet.

import AdminGuard from '@/components/AdminGuard'
import { ensureDevFixturesRegistered } from '@/lib/metrics/devFixtures'
import { LineTile } from '@/components/intelligence/tiles/LineTile'
import { BarTile } from '@/components/intelligence/tiles/BarTile'
import { NumberTile } from '@/components/intelligence/tiles/NumberTile'
import { HeatmapTile } from '@/components/intelligence/tiles/HeatmapTile'
import { MuscleMapTile } from '@/components/intelligence/tiles/MuscleMapTile'

export const dynamic = 'force-dynamic'

const WINDOW = {
  start: new Date('2026-05-01T00:00:00Z'),
  end: new Date('2026-05-28T00:00:00Z'),
}

export default async function TileGalleryPage() {
  ensureDevFixturesRegistered()

  return (
    <AdminGuard>
      <div className="mx-auto max-w-3xl px-4 py-6" data-testid="tile-gallery">
        <h1 className="mb-4 text-xl font-semibold text-zinc-100">
          Tile gallery
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          Each of the 5 tile variants rendered against a fixture metric. Use
          this page to verify visual / a11y output without wiring real data.
        </p>

        <section data-testid="gallery-line" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            LineTile
          </h2>
          <LineTile metricId="_dev_line_workouts" window={WINDOW} />
        </section>

        <section data-testid="gallery-strength-curve" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            LineTile — strength curve (bench press)
          </h2>
          <LineTile metricId="_dev_line_strength_curve" window={WINDOW} />
        </section>

        <section data-testid="gallery-bar" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            BarTile
          </h2>
          <BarTile metricId="_dev_bar_volume" window={WINDOW} />
        </section>

        <section data-testid="gallery-bar-volume-by-muscle" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            BarTile — weekly volume by muscle
          </h2>
          <BarTile metricId="_dev_bar_volume_by_muscle" window={WINDOW} />
        </section>

        <section data-testid="gallery-prs-timeline" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            LineTile — PRs timeline
          </h2>
          <LineTile metricId="_dev_line_prs_timeline" window={WINDOW} />
        </section>

        <section data-testid="gallery-number" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            NumberTile
          </h2>
          <NumberTile metricId="_dev_number_streak" window={WINDOW} />
        </section>

        <section data-testid="gallery-heatmap" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            HeatmapTile
          </h2>
          <HeatmapTile metricId="_dev_heatmap_activity" window={WINDOW} />
        </section>

        <section data-testid="gallery-muscle" className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            MuscleMapTile
          </h2>
          <MuscleMapTile metricId="_dev_muscle_intensity" window={WINDOW} />
        </section>
      </div>
    </AdminGuard>
  )
}
