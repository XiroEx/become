'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export interface BackButtonProps {
  /** Optional fallback href when there's no history to go back to. */
  fallbackHref?: string
  /** When set, ALWAYS navigate here instead of using history. Use on hub pages
   *  with a fixed parent where router.back() can land on a transient page (e.g.
   *  a just-created item) sitting in the history stack. */
  href?: string
  className?: string
}

/**
 * Standard round back button used across drill-in dashboard pages. Goes back in
 * history; if there's nothing to go back to (e.g. deep-linked / fresh tab) it
 * navigates to `fallbackHref` (default the dashboard home). When `href` is set,
 * it always navigates there (deterministic). Client component so it can be
 * dropped into server-rendered pages too.
 */
export function BackButton({ fallbackHref = '/dashboard', href, className = '' }: BackButtonProps) {
  const router = useRouter()
  const handleBack = () => {
    if (href) {
      router.push(href)
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }
  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Back"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  )
}

export default BackButton
