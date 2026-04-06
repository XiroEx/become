'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'

const tabs = [
  { label: 'Overview', href: '/dashboard/admin' },
  { label: 'Users', href: '/dashboard/admin/users' },
  { label: 'Analytics', href: '/dashboard/admin/analytics' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard/admin') return pathname === '/dashboard/admin'
    return pathname?.startsWith(href)
  }

  return (
    <AdminGuard>
      {/* Sub-nav tabs — sits below the dashboard TopNav, above page content */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl gap-1 px-3 py-2 sm:px-6">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                isActive(tab.href)
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </AdminGuard>
  )
}
