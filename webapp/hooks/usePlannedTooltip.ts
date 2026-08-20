"use client"

import { useEffect, useRef, useState } from 'react'

/**
 * Shared open/close state for a "planned" chart tooltip: hover opens it on
 * desktop, a tap toggles it on mobile (click fires after touchend, so one
 * handler covers both), and a tap/click anywhere outside closes it — mirrors
 * the outside-dismiss pattern the profile dropdown already uses in TopNav.
 */
export function usePlannedTooltip() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return {
    open,
    containerRef,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen((v) => !v),
  }
}
