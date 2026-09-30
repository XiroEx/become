"use client"

// Labeled header action pill — the standard "icon + label" bordered button for
// page headers (Recipes / Timeline / Log). Never ship an ambiguous icon-only
// header button; use this.

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

const cls =
  'flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700'

export function HeaderPillLink({ href, Icon, children, 'data-tour': dataTour }: { href: string; Icon: LucideIcon; children: React.ReactNode; 'data-tour'?: string }) {
  return (
    <Link href={href} className={cls} data-tour={dataTour}>
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  )
}

export function HeaderPillButton({ onClick, Icon, children }: { onClick: () => void; Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}
