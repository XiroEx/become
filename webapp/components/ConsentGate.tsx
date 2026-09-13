'use client'

// The in-app consent gate: the record that a member agreed to the Terms and
// Privacy Policy, and said they were old enough, for every member who has no
// such record — which on 2026-09-13 was every member.
//
// WHY A GATE AND NOT A BANNER. Two things need a timestamp against a version:
// the NY GBL 527-a consent evidence the plan page's renewal disclosure relies
// on, and the chargeback defence ("they agreed to these terms on this date").
// A dismissable banner produces neither. So the sheet blocks until the box is
// ticked, and it is one tick.
//
// WHO SEES IT. Anyone whose stored `consent.termsVersion` is not the current
// LEGAL_VERSION: members from before the record existed, members created by a
// path that could not collect the tick (Google, passkey, a login-mode magic
// link for an unknown address), and everyone after a version bump that needs
// re-agreement. A sign-up through the form has the record already and never
// sees this.
//
// FAILS OPEN. A network blip, a 500, a missing token: no sheet. The server
// holds the truth and asks again next open; a member locked out of the app by
// a flaky connection would be a worse outcome than a day's delay in evidence.
// Same rule as every client-side lock in this app.
//
// Mounted in the dashboard layout (persists across dashboard navigation, so
// one request per app load) and on the onboarding page, so a brand-new
// Google member agrees BEFORE entering health data, not after.

import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/clientAuth'
import { useLockScroll } from '@/lib/useLockScroll'
import { ConsentSheet } from './ConsentSheet'

interface ConsentStatusBody {
  termsVersion?: string
  current?: boolean
}

/** Module-level: once agreed (or confirmed current) in this tab, never asked
 *  again for the life of the bundle, whichever mount point asks. */
let settledCurrent = false

export default function ConsentGate() {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useLockScroll(open)

  useEffect(() => {
    if (settledCurrent) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/consent', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok || cancelled) return
        const body = (await res.json().catch(() => null)) as ConsentStatusBody | null
        if (cancelled || !body) return
        if (body.current === true) {
          settledCurrent = true
          return
        }
        if (body.current === false) setOpen(true)
      } catch {
        // Fail open — see the header comment.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const agree = useCallback(async () => {
    if (!checked || busy) return
    setBusy(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch('/api/me/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ accepted: true }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      settledCurrent = true
      setOpen(false)
    } catch {
      setError('That did not save. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }, [checked, busy])

  if (!open) return null
  return <ConsentSheet checked={checked} onCheckedChange={setChecked} onAgree={agree} busy={busy} error={error} />
}
