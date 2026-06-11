"use client"
import React from 'react'
import BottomNav from '../../components/BottomNav'
import TopNav from '../../components/TopNav'
import AuthGuard from '../../components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
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
    </AuthGuard>
  )
}
