"use client"

import { useEffect, useState } from 'react'

/**
 * Returns the height (px) the on-screen keyboard currently overlaps the bottom of
 * the layout viewport.
 *
 * Why this is needed: on iOS the *layout* viewport — what `position: fixed` /
 * `inset-0` / `100vh` resolve against — does NOT shrink when the software keyboard
 * opens; only the *visual* viewport does. So a bottom-anchored sheet (`flex
 * items-end`) stays pinned to the true bottom of the screen, hidden behind the
 * keyboard along with its action buttons. Add this value as `paddingBottom` on the
 * overlay (or a `translateY` on the sheet) to lift the content above the keyboard.
 *
 * Returns 0 when inactive, when the keyboard is closed, or when `visualViewport` is
 * unavailable (SSR / very old browsers), so callers can use it unconditionally.
 */
export function useKeyboardInset(active: boolean = true): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      setInset(0)
      return
    }
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      // The keyboard occupies the gap between the visual viewport's bottom edge and
      // the layout viewport's bottom edge. offsetTop accounts for the page having
      // scrolled up under the keyboard.
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      setInset(overlap > 1 ? Math.round(overlap) : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setInset(0)
    }
  }, [active])

  return inset
}
