"use client"
import React from 'react'
import BottomNav from '../../components/BottomNav'
import TopNav from '../../components/TopNav'
import AuthGuard from '../../components/AuthGuard'
import MindSessionWarmer from '../../components/mind/MindSessionWarmer'
import TutorialRoot from '../../components/tutorial/TutorialRoot'
import PushSubscriptionSync from '../../components/PushSubscriptionSync'
import AppBadgeSync from '../../components/AppBadgeSync'
import ConsentGate from '../../components/ConsentGate'
import AiConsentPrompt from '../../components/AiConsentPrompt'

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
      {/* Blocks until the member has agreed to the CURRENT Terms and Privacy
          Policy and attested to the minimum age. Here, not on the home page,
          so it covers every protected route and runs once per app load. */}
      <ConsentGate />
      {/* Raises the AI permission ask when a dispatch was refused for want of
          it — the one listener for the event lib/ai/runStore.ts fires. Here so
          every AI surface, including the background ones, is covered. */}
      <AiConsentPrompt />
      {/* Shell: full viewport height, flex column, no page-level scroll */}
      <div
        className="flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950"
        style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Top nav — fixed height, never scrolls */}
        <div className="shrink-0">
          <TopNav />
        </div>

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
