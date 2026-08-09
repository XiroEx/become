/**
 * The PWA manifest, served from a route rather than public/manifest.json.
 *
 * It used to be a static file with the name hard-coded to "Become", so an
 * install from the beta channel produced an icon identical to production's —
 * same name, same icon, no way to tell which one you were tapping.
 *
 * Deliberately kept at the SAME path (/manifest.json) rather than moving to
 * Next's generated /manifest.webmanifest: already-installed PWAs and the
 * service worker (public/sw.js special-cases this exact path) both reference it.
 * A static file in public/ would shadow this route, which is why the old one was
 * removed rather than left in place.
 */

import { APP_NAME, APP_SHORT_NAME, APP_DESCRIPTION } from '@/lib/appChannel'

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

export function GET() {
  const manifest = {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#18181b',
    scope: '/',
    icons: ICON_SIZES.map((size) => ({
      src: `/icons/icon-${size}x${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'maskable any',
    })),
    categories: ['fitness', 'health', 'lifestyle'],
    screenshots: [],
    prefer_related_applications: false,
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Short cache: the name is build-time, but a stale manifest on a device
      // that just switched channels is confusing for longer than it is worth.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
