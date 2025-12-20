"use client"
import React from 'react'
import BottomNav from '../../components/BottomNav'
import TopNav from '../../components/TopNav'
import AuthGuard from '../../components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-dvh flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        <TopNav />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-3 py-4 pb-4 sm:px-6 sm:py-6">{children}</div>
        </main>
        <BottomNav />
      </div>
    </AuthGuard>
  )
}
