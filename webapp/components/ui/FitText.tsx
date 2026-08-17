'use client'

// One line, always. Shrinks its font until the text fits the width it has.
//
// Dashboard tile values ("Pretty Good", "Set a goal", "12 lbs to go") wrapped
// onto a second line at the tile's 2xl size and pushed the footer off the
// bottom of the fixed-height cell. Picking a size per string does not survive
// different phones, fonts and lengths; measuring does. The base size comes from
// the parent's CSS (text-2xl etc.), so callers keep styling as before.

import * as React from 'react'
import { cn } from '@/lib/cn'

export interface FitTextProps {
  children: React.ReactNode
  /** Smallest font size we will shrink to, in px. */
  min?: number
  className?: string
}

export function FitText({ children, min = 11, className }: FitTextProps) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const box = el.parentElement
    if (!box) return

    let raf = 0
    const fit = () => {
      // Reset to the CSS size, then compare natural width to available width.
      el.style.fontSize = ''
      const avail = box.clientWidth
      const need = el.scrollWidth
      if (avail > 0 && need > avail) {
        const base = parseFloat(getComputedStyle(el).fontSize) || 16
        const next = Math.max(min, Math.floor(base * (avail / need) * 100) / 100)
        el.style.fontSize = `${next}px`
      }
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(fit)
    }

    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(box)
    // Web fonts land after first paint and change widths.
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    fonts?.ready?.then(schedule).catch(() => {})
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [children, min])

  return (
    <span
      ref={ref}
      data-fit-text=""
      className={cn('block max-w-full whitespace-nowrap', className)}
    >
      {children}
    </span>
  )
}
