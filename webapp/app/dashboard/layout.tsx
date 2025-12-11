"use client"
import React from 'react'
import BottomNav from '../../components/BottomNav'
import TopNav from '../../components/TopNav'
import AuthGuard from '../../components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <TopNav />
        <main className="mx-auto max-w-3xl p-6 pb-24">{children}</main>
        <BottomNav />
      </div>
    </AuthGuard>
  )
}
