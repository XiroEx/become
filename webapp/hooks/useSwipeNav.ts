'use client'

// Shared horizontal swipe-to-navigate gesture — THE one swipe implementation
// for date-paged views (calendar, nutrition day, timeline day/week/month).
// Extracted from CalendarClient so every surface behaves identically:
// ≥50px horizontal travel, ignores primarily-vertical gestures (scrolling).
//
// Usage:
//   const swipe = useSwipeNav({ onPrev, onNext })
//   <div {...swipe.handlers}>…</div>
// Pair with `slideVariants` + a `direction` state for the calendar-style
// slide animation (AnimatePresence custom={direction} mode="popLayout").

import { useRef } from 'react'
import type React from 'react'

const MIN_SWIPE_PX = 50

export interface UseSwipeNavOptions {
  onPrev: () => void
  onNext: () => void
  /** Disable handling (e.g. while a modal is open). */
  disabled?: boolean
}

export interface UseSwipeNav {
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
  }
}

export function useSwipeNav({ onPrev, onNext, disabled }: UseSwipeNavOptions): UseSwipeNav {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (disabled) return
    if (startX.current === null || startY.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    const dy = e.changedTouches[0].clientY - startY.current
    startX.current = null
    startY.current = null
    // Ignore short swipes or primarily-vertical gestures (scrolling).
    if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0) onNext()
    else onPrev()
  }

  return { handlers: { onTouchStart, onTouchEnd } }
}

/** Calendar-style slide variants for AnimatePresence (custom = direction ±1). */
export const slideVariants = {
  initial: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%' }),
  animate: { x: 0 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-100%' : '100%' }),
}
