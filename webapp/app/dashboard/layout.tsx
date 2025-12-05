import React from 'react'
import BottomNav from '../../components/BottomNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-3xl mx-auto p-6">{children}</main>
      <BottomNav />
    </div>
  )
}
