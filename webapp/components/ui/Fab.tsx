"use client"

// Floating action button — bottom-right, above the liquid-glass nav pill
// (which owns the bottom band up to ~bottom-28; see project memory). One
// consistent size/elevation everywhere.

import type { LucideIcon } from 'lucide-react'

export default function Fab({
  onClick,
  Icon,
  label,
}: {
  onClick: () => void
  Icon: LucideIcon
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 dark:bg-white dark:text-black sm:right-6"
    >
      <Icon className="h-6 w-6" />
    </button>
  )
}
