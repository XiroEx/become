'use client'

// The in-app consent gate: the record that a member agreed to the Terms and
// Privacy Policy, and said they were old enough, for every member who has no
// such record — which on 2026-09-13 was every member. It also carries the
// second, separate ask: whether Become may send what they submit to its AI
// provider (App Store Guideline 5.1.2(i)).
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
// sees this — unless the AI question is still open, which is its own version
// and its own answer.
//
// THE AI TICK IS NOT A CONDITION OF ENTRY. The button does not wait for it,
// leaving it unticked records a refusal, and the member gets into the app
// either way. What it is NOT is skippable: a member who answers nothing is
// asked again next load, because an unanswered question is not a refusal and
// silence must never be read as permission. Closing the sheet is not an option
// the sheet offers — answering it is, in either direction.
//
// FAILS OPEN. A network blip, a 500, a missing token: no sheet. The server
// holds the truth and asks again next open; a member locked out of the app by
// a flaky connection would be a worse outcome than a day's delay in evidence.
// Same rule as every client-side lock in this app. Note the asymmetry with the
// SERVER gate in lib/aiConsent.ts, which fails CLOSED: not showing the ask
// costs a day, wrongly answering it for somebody costs their data.
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
  ai?: { granted?: boolean; decided?: boolean }
}

/** Module-level: once every open question is answered in this tab, never asked
 *  again for the life of the bundle, whichever mount point asks. */
let settledCurrent = false

export default function ConsentGate() {
  const [open, setOpen] = useState(false)
  const [needsTerms, setNeedsTerms] = useState(false)
  const [needsAi, setNeedsAi] = useState(false)
  const [checked, setChecked] = useState(false)
  const [aiChecked, setAiChecked] = useState(false)
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
        const termsOpen = body.current === false
        // `decided` is the question, not `granted`: a member who said no has
        // answered, and re-asking every app open would be nagging them into a
        // yes. They can change their mind in Settings.
        const aiOpen = body.ai?.decided === false
        if (!termsOpen && !aiOpen) {
          settledCurrent = true
          return
        }
        setNeedsTerms(termsOpen)
        setNeedsAi(aiOpen)
        setOpen(true)
      } catch {
        // Fail open — see the header comment.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const agree = useCallback(async () => {
    if ((needsTerms && !checked) || busy) return
    setBusy(true)
    setError(null)
    try {
      const token = getToken()
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` }
      // One request either way. The terms endpoint carries both answers when
      // both were asked; when only the AI question was open, the terms record
      // is already current and must not be re-stamped with today's date — the
      // date it was actually given is the evidence.
      const res = needsTerms
        ? await fetch('/api/me/consent', {
            method: 'POST',
            headers,
            body: JSON.stringify(needsAi ? { accepted: true, ai: aiChecked } : { accepted: true }),
          })
        : await fetch('/api/me/ai-consent', {
            method: 'POST',
            headers,
            body: JSON.stringify({ accepted: aiChecked, source: 'gate' }),
          })
      if (!res.ok) throw new Error(`status ${res.status}`)
      settledCurrent = true
      setOpen(false)
    } catch {
      setError('That did not save. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }, [checked, aiChecked, busy, needsTerms, needsAi])

  if (!open) return null
  return (
    <ConsentSheet
      checked={checked}
      onCheckedChange={setChecked}
      onAgree={agree}
      busy={busy}
      error={error}
      showTerms={needsTerms}
      showAi={needsAi}
      aiChecked={aiChecked}
      onAiCheckedChange={setAiChecked}
    />
  )
}
