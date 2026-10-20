'use client'

/**
 * Dismissible "Get the app" prompt for Android mobile web (NP-205).
 *
 * iOS already gets Safari's own smart banner from the `apple-itunes-app` meta
 * tag (webapp/app/layout.tsx + lib/appleAppId.ts) — Android has no browser
 * equivalent, which is what this component exists to stand in for. The
 * decision itself (show / which store / never inside the app) is pure and
 * lives in lib/getAppBanner.ts; this component only wires DOM facts
 * (User-Agent, the native-browser cookie, localStorage dismissal, the
 * runtime store URL) into it.
 *
 * Mounted once, in webapp/app/dashboard/layout.tsx, so every signed-in
 * protected route carries it — never mounted in the native app, which has no
 * use for this layout at all.
 */

import { useEffect, useState } from 'react'
import { decideAppBanner } from '@/lib/getAppBanner'
import { classifyDeviceOS } from '@/lib/deviceOS'
import { isNativeBrowserCookieHeader } from '@/lib/nativeBrowserMarker'

const DISMISSED_KEY = 'get_app_banner_dismissed'

export default function GetAppBanner() {
  const [storeUrl, setStoreUrl] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === '1'
    const isNativeAppBrowser = isNativeBrowserCookieHeader(document.cookie)

    // Cheap refusals first — no need to fetch the store config for a member
    // this can never show to (not Android, already dismissed, or inside the
    // native app's own in-app browser).
    if (isNativeAppBrowser || dismissed) return
    if (classifyDeviceOS(navigator.userAgent) !== 'android') return

    let cancelled = false
    fetch('/api/app/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((config: { android?: { storeUrl?: string } } | null) => {
        if (cancelled) return
        const decision = decideAppBanner({
          userAgent: navigator.userAgent,
          isNativeAppBrowser,
          dismissed,
          androidStoreUrl: config?.android?.storeUrl ?? null,
        })
        if (decision.show && decision.storeUrl) {
          setStoreUrl(decision.storeUrl)
          setVisible(true)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  if (!visible || !storeUrl) return null

  const dismiss = () => {
    setVisible(false)
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Storage can throw in private mode; dismissing for this page view is
      // still honoured even if it doesn't stick.
    }
  }

  return (
    <div
      data-testid="get-app-banner"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <p className="min-w-0 flex-1 text-sm text-zinc-900 dark:text-white">
        Get the Become app — one sign-in, reminders that always land.
      </p>
      <a
        href={storeUrl}
        className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      >
        Get the app
      </a>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="shrink-0 text-xs font-medium text-zinc-500 hover:underline dark:text-zinc-400"
      >
        Not now
      </button>
    </div>
  )
}
