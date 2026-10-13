import { NextResponse } from 'next/server'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/config (NP-041)
 *
 * Public endpoint for native app version gating and store configuration.
 * Returns { ios: { minVersion, latestVersion, storeUrl }, android: { minVersion, latestVersion, storeUrl } }.
 * Cache headers allow caching on edge / devices while ensuring reasonable freshness.
 * Rules that travel: the gate fails open (errors return empty configs rather than failing closed).
 */
export async function GET() {
  try {
    const config = await getRuntimeConfig()
    return NextResponse.json(config.app, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('GET /api/app/config:', error)
    // The gate fails open: return 200 with empty configs so clients don't block.
    return NextResponse.json(
      { ios: {}, android: {} },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      },
    )
  }
}
