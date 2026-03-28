"use client"
import React from 'react'
import { AppShell } from '@redbtn/redstyle'
import BottomNav from '../../components/BottomNav'
import TopNav from '../../components/TopNav'
import AuthGuard from '../../components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell className="bg-zinc-950">
        <AppShell.Header>
          <TopNav />
        </AppShell.Header>
        <AppShell.Content>
          <div className="mx-auto max-w-3xl px-3 py-4 pb-4 sm:px-6 sm:py-6">{children}</div>
        </AppShell.Content>
        <AppShell.Footer>
          <BottomNav />
        </AppShell.Footer>
      </AppShell>
    </AuthGuard>
  )
}
