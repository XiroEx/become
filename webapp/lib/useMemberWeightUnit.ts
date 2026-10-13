'use client'

// NP-209: the member's lb/kg preference, read from `profile.weightUnit` and
// writable in one place. `profile.weightUnit` carries no default any more
// (models/User.ts) — absent means "never asked" (George's DECIDED comment on
// NP-209) — so this hook is both:
//   - the DISPLAY read every lifting-load label/input in the webapp uses
//     (`weightUnit`, always 'lbs' | 'kg', falling back to 'lbs' exactly the
//     way the server does: `weightUnit ?? 'lbs'`);
//   - the ONE write path (`choose`), used by WeightUnitGate to persist the
//     member's answer via the existing PATCH /api/profile.
//
// FAILS OPEN, same convention as ConsentGate: a network blip or a missing
// token just leaves `weightUnit` at its 'lbs' display default and `hasChosen`
// unresolved — never a blocked screen. `loaded` distinguishes "still
// checking" from "checked, and the member hasn't chosen yet", which is what
// lets WeightUnitGate avoid a one-frame flash of the ask on members who
// already picked.
import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/clientAuth'

export type WeightUnit = 'lbs' | 'kg'

interface ProfileBody {
  profile?: { weightUnit?: WeightUnit }
}

/** Module-level cache: one /api/profile read per tab for this question,
 *  mirroring ConsentGate's `settledCurrent`. */
let cachedUnit: WeightUnit | null = null
let cachedHasChosen: boolean | null = null

export function useMemberWeightUnit() {
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(cachedUnit ?? 'lbs')
  const [hasChosen, setHasChosen] = useState<boolean>(cachedHasChosen ?? false)
  const [loaded, setLoaded] = useState(cachedUnit !== null)

  useEffect(() => {
    if (cachedUnit !== null) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok || cancelled) return
        const body = (await res.json().catch(() => null)) as ProfileBody | null
        if (cancelled) return
        const chosen = body?.profile?.weightUnit
        cachedUnit = chosen ?? 'lbs'
        cachedHasChosen = chosen !== undefined
        setWeightUnit(cachedUnit)
        setHasChosen(cachedHasChosen)
        setLoaded(true)
      } catch {
        // Fail open — see the header comment.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const choose = useCallback(async (unit: WeightUnit) => {
    cachedUnit = unit
    cachedHasChosen = true
    setWeightUnit(unit)
    setHasChosen(true)
    try {
      const token = getToken()
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ profile: { weightUnit: unit } }),
      })
    } catch {
      // Best-effort — a failed save re-asks next load since cachedHasChosen
      // only persists for this tab, not across a reload.
    }
  }, [])

  return { weightUnit, hasChosen, loaded, choose }
}
