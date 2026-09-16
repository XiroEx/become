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

/**
 * Home-screen shortcuts — long-press the installed Become icon and jump
 * straight into one of the four things a member actually opens the app to do.
 *
 * True lock-screen / home-screen WIDGETS are an OS surface (iOS WidgetKit,
 * Android App Widgets) and can only come from the native app in `expo/`; the
 * data behind them is `GET /api/widgets/summary`, which is deliberately shaped
 * so every one of these four has a widget to be.
 *
 * These shortcuts are one of the three things the WEB app can do instead. The
 * other two are the app-icon badge (lib/widgets/badge.ts) and the daily glance
 * on the lock screen (lib/widgets/glance.ts) — and they matter more here than
 * this does, because iOS ignores `shortcuts` entirely.
 *
 * `url` must stay inside `scope` and must be a real route — a shortcut to a
 * 404 is invisible until someone taps it. tests/unit/widgets/feed.test.ts
 * checks each one against the app directory.
 *
 * No per-shortcut `icons`: there is no distinct art for these four, and four
 * copies of the app icon in a launcher menu is worse than the launcher's own
 * fallback.
 */
const SHORTCUTS = [
  {
    name: 'Start a workout',
    short_name: 'Workout',
    description: "Open today's training session",
    url: '/dashboard/workout',
  },
  {
    name: 'Log food',
    short_name: 'Nutrition',
    description: 'Log a meal and see your macros',
    url: '/dashboard/nutrition',
  },
  {
    name: "Today's Mind session",
    short_name: 'Mind',
    description: 'Open your daily Mind session',
    url: '/dashboard/mind',
  },
  {
    name: 'Your Becoming',
    short_name: 'Becoming',
    description: 'See how far you have come',
    url: '/dashboard/mind/becoming',
  },
]

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
    shortcuts: SHORTCUTS,
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
