'use client'

// NP-209: one hook, one fetch, one fallback — every lifting-load display that
// needs the member's unit preference reads it from here instead of growing
// its own `GET /api/profile` call. Mirrors the read-time rule everywhere else
// in the app: `profile.weightUnit ?? 'lbs'` (models/User.ts#weightUnit). The
// field itself carries NO default any more — absent means "never asked" — so
// this hook's fallback is what keeps every existing member's screen
// unchanged until they actually choose.

import { useEffect, useState } from 'react'
import { getToken } from '@/lib/clientAuth'

export type WeightUnit = 'lbs' | 'kg'

/**
 * The member's lifting-load display unit. Starts at the 'lbs' fallback and
 * flips to 'kg' only once the profile fetch confirms it — never blocks
 * render, and fails open to lbs on any error (same asymmetry as
 * components/ConsentGate.tsx: a wrong label for one request is a far smaller
 * cost than blocking the screen).
 */
export function useMemberWeightUnit(): WeightUnit {
  const [unit, setUnit] = useState<WeightUnit>('lbs')

  useEffect(() => {
    const token = getToken()
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok || cancelled) return
        const body = (await res.json().catch(() => null)) as { profile?: { weightUnit?: string } } | null
        if (cancelled) return
        if (body?.profile?.weightUnit === 'kg') setUnit('kg')
      } catch {
        // Fail open to lbs — see the header comment.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return unit
}
