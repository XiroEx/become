'use client'

// The ask, raised at the moment a member actually reaches for an AI feature.
//
// WHY IT EXISTS SEPARATELY FROM ConsentGate. The gate asks on app load, which
// covers everybody eventually. This covers the two cases the gate cannot:
//   • a member who said no and has now tapped "Scan my plate" — the one moment
//     they might want to say yes, and the only moment the question is concrete;
//   • a member whose permission was withdrawn (by them, in Settings) or whose
//     answer is for an older AI_CONSENT_VERSION.
//
// It is the ONE listener for lib/aiConsentClient.ts#AI_CONSENT_EVENT, which
// lib/ai/runStore.ts fires when a dispatch comes back refused. Mounted once in
// the dashboard layout, so every AI surface in the app is covered without any
// of them knowing this component exists.
//
// It never pre-ticks the box. A sheet raised BY the member's own tap is still
// not permission from the member, and a pre-ticked box that a thumb is already
// moving toward is exactly the pattern Guideline 5.1.2(i) exists to stop.

import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/clientAuth'
import { useLockScroll } from '@/lib/useLockScroll'
import { AI_CONSENT_EVENT } from '@/lib/aiConsentClient'
import { ConsentSheet } from './ConsentSheet'

export default function AiConsentPrompt() {
  const [open, setOpen] = useState(false)
  const [aiChecked, setAiChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useLockScroll(open)

  useEffect(() => {
    const onAsk = () => {
      setAiChecked(false)
      setError(null)
      setOpen(true)
    }
    window.addEventListener(AI_CONSENT_EVENT, onAsk)
    return () => window.removeEventListener(AI_CONSENT_EVENT, onAsk)
  }, [])

  const save = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch('/api/me/ai-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ accepted: aiChecked, source: 'prompt' }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setOpen(false)
    } catch {
      setError('That did not save. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }, [aiChecked, busy])

  if (!open) return null
  return (
    <ConsentSheet
      checked
      onCheckedChange={() => {}}
      onAgree={save}
      busy={busy}
      error={error}
      showTerms={false}
      showAi
      aiChecked={aiChecked}
      onAiCheckedChange={setAiChecked}
    />
  )
}
