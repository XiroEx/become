'use client'

// NP-205: a dismissible "Get the app" prompt for members still on mobile web.
// iOS gets Safari's own smart banner instead (the apple-itunes-app meta tag
// in app/layout.tsx's generateMetadata) — this is the Android half, since
// Chrome has no server-driven equivalent. Mounted in dashboard/layout.tsx, so
// it covers every protected route the way PushSubscriptionSync does.
//
// Must NEVER render inside the native app's own in-app browser (Tier-3 "edit
// in web" deep links) — that is an explicit acceptance rule, not a nice-to-
// have. shouldShowGetAppBanner refuses whenever become_native_browser is set,
// a cookie middleware.ts mints from the `?app=1` the app appends to every URL
// it opens (lib/nativeBrowserMarker.ts).

import { useEffect, useState } from 'react'
import { classifyUserAgent } from '@/lib/deviceOS'
import { shouldShowGetAppBanner } from '@/lib/getAppBanner'
import { NATIVE_BROWSER_COOKIE } from '@/lib/nativeBrowserMarker'

const DISMISSED_KEY = 'become_get_app_dismissed'

function readCookie(name: string): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some((entry) => entry === `${name}=1`)
}

export default function GetAppBanner() {
  const [storeUrl, setStoreUrl] = useState<string | undefined>(undefined)
  const [dismissed, setDismissed] = useState(true) // fail closed until localStorage is read
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === '1')
    } catch {
      setDismissed(false)
    }

    let cancelled = false
    fetch('/api/app/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((config: { android?: { storeUrl?: string } } | null) => {
        if (!cancelled) setStoreUrl(config?.android?.storeUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const os = classifyUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent)
    setVisible(
      shouldShowGetAppBanner({
        os,
        openedByNativeApp: readCookie(NATIVE_BROWSER_COOKIE),
        dismissed,
        storeUrl,
      }),
    )
  }, [dismissed, storeUrl])

  if (!visible) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div
      data-testid="get-app-banner"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <span className="text-zinc-700 dark:text-zinc-200">
        Get the Become app — one sign-in, reminders that just work.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={storeUrl}
          data-testid="get-app-banner-link"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Get the app
        </a>
        <button
          type="button"
          onClick={dismiss}
          data-testid="get-app-banner-dismiss"
          aria-label="Dismiss"
          className="px-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
