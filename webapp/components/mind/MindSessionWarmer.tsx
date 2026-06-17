'use client'

// Warms the AI Mind session in the background on APP OPEN. Mounted once in the
// dashboard shell so the (cooldown-gated, silent) composition happens up front
// — by the time the user opens the Mind tab the session is usually ready, and
// the tab never has to block on generation.

import { useEffect } from 'react'
import { precomposeMindSession } from '@/lib/mind/precompose'

export default function MindSessionWarmer() {
  useEffect(() => {
    // Defer a tick so it never competes with first paint / critical fetches.
    const t = setTimeout(() => { precomposeMindSession() }, 1200)
    return () => clearTimeout(t)
  }, [])
  return null
}
