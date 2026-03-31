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

        {/* Content — grows to fill remaining space, scrolls vertically */}
        <main
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ overscrollBehaviorY: 'contain' }}
        >
          <div className="mx-auto max-w-3xl px-3 py-4 pb-6 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>

        {/* Bottom nav — fixed height, sits above iOS home indicator */}
        <div className="shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <BottomNav />
        </div>
      </div>
    </AuthGuard>
  )
}
