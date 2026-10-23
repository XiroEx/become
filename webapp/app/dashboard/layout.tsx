// NOT 'use client': this layout needs generateMetadata (server-only) for the
// NP-205 apple-itunes-app tag below, and everything it renders is already
// its own client component — a server layout composing client children
// works exactly like a client one did, with no hooks of its own to lose.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import React from 'react'
import BottomNav from '../../components/BottomNav'
import AuthGuard from '../../components/AuthGuard'
import MindSessionWarmer from '../../components/mind/MindSessionWarmer'
import TutorialRoot from '../../components/tutorial/TutorialRoot'
import PushSubscriptionSync from '../../components/PushSubscriptionSync'
import AppBadgeSync from '../../components/AppBadgeSync'
import TimezoneSync from '../../components/TimezoneSync'
import ConsentGate from '../../components/ConsentGate'
import AiConsentPrompt from '../../components/AiConsentPrompt'
import WeightUnitGate from '../../components/WeightUnitGate'
import GetAppBanner from '../../components/GetAppBanner'
import { getRuntimeConfig } from '../../lib/runtimeConfig'
import { appleItunesAppContent } from '../../lib/appleAppId'
import { NATIVE_BROWSER_COOKIE } from '../../lib/nativeBrowserMarker'

/**
 * Safari's `apple-itunes-app` smart banner (NP-205) — never drawn to a
 * member already inside the native app's own in-app browser (see
 * lib/nativeBrowserMarker.ts; that cookie originates ONLY at
 * app/auth/handoff/route.ts, the one URL exclusively opened by the app).
 * Scoped to /dashboard rather than the root layout: this is the one segment
 * Tier-3's in-app browser actually reaches, and every /dashboard page is
 * already behind AuthGuard and personalized — unlike the marketing pages,
 * it costs nothing extra to make dynamic. Fails to no tag on any error: a
 * missing banner costs nothing, a layout that throws takes the page down.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const store = await cookies()
    if (store.get(NATIVE_BROWSER_COOKIE)?.value === '1') return {}
    const { app } = await getRuntimeConfig()
    const base = process.env.NEXT_PUBLIC_WEBAPP_BASE_URL || ''
    const content = appleItunesAppContent(app.ios.storeUrl, `${base}/dashboard`)
    return content ? { other: { 'apple-itunes-app': content } } : {}
  } catch {
    return {}
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* Onboarding tour (redTutorial) — account-based progress, plays once. */}
      <TutorialRoot>
      {/* Background: compose the AI Mind session on app open (cooldown-gated). */}
      <MindSessionWarmer />
      {/* Background: keep this device's push subscription registered. Lives here
          rather than on the dashboard home so it covers every protected route. */}
      <PushSubscriptionSync />
      {/* Background: keep the count on the installed app's home-screen icon in
          step with what the member still owes today. */}
      <AppBadgeSync />
      {/* Background: record the member's timezone when the app opens (at most
          once per local day). Until this existed only a workout save stored
          one, and the notify cron skips a member who has none — so a member
          who only logs food got no reminders at all. */}
      <TimezoneSync />
      {/* Blocks until the member has agreed to the CURRENT Terms and Privacy
          Policy and attested to the minimum age. Here, not on the home page,
          so it covers every protected route and runs once per app load. */}
      <ConsentGate />
      {/* Raises the AI permission ask when a dispatch was refused for want of
          it — the one listener for the event lib/ai/runStore.ts fires. Here so
          every AI surface, including the background ones, is covered. */}
      <AiConsentPrompt />
      {/* NP-209: asks a member with no stored lb/kg preference, once, and
          persists the choice. Here so it covers every protected route, same
          as ConsentGate above. */}
      <WeightUnitGate />
      {/* NP-205: dismissible "Get the app" prompt, Android mobile web only —
          iOS gets Safari's own apple-itunes-app banner (app/layout.tsx).
          Never rendered inside the native app itself (GetAppBanner checks
          the in-app-browser marker before showing anything). */}
      <GetAppBanner />
      {/* Shell: full viewport height, flex column, no page-level scroll */}
      <div
        className="flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950"
        style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Content — grows to fill remaining space, scrolls vertically.
            id="app-scroll" is the contract the floating BottomNav uses to
            react to scrolling. Bottom padding clears the floating pill
            (pill ≈ 62px + 10px gap) plus the iOS home indicator. */}
        <main
          id="app-scroll"
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ overscrollBehaviorY: 'contain' }}
        >
          <div
            className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-6"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
          >
            {children}
          </div>
        </main>

        {/* Bottom nav — floating liquid-glass pill (fixed; overlays content) */}
        <BottomNav />
      </div>
      </TutorialRoot>
    </AuthGuard>
  )
}
