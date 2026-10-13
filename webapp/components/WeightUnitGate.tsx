'use client'

// NP-209: Jon's rule, verbatim from the card — "the KG members should be able
// to use KG throughout the whole app. yes you should be asked if you dont
// pick 'lb or Kg' which one you want to do." This is the one ask.
//
// WHO SEES IT. Any member whose `profile.weightUnit` is absent — which, per
// the field's own house pattern (models/User.ts#weightUnit, same rule as
// aiConsent/consent/deletion/apple), means "never asked", not "chose lbs".
// The 46 accounts that already carry an explicit 'lbs' are NOT asked again —
// they are treated as having chosen it (accepted residual, NP-209 card).
//
// NOT A LEGAL GATE. Unlike ConsentGate this never blocks entry to the app —
// picking is one tap either way and there is no wrong answer, so there is no
// reason to make a member sit behind a sheet for it. It is still NOT
// skippable in the sense that matters: there is no "close without choosing"
// control, so an unanswered ask is asked again next load rather than ever
// being read as a silent lbs default (that is exactly the byte-identical
// problem the DECIDED comment on the card describes).
//
// FAILS OPEN, same asymmetry as every client-side ask in this app
// (ConsentGate's header comment explains why): a network blip means no sheet
// this load, not a wrongly-recorded choice.

import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/clientAuth'
import { useLockScroll } from '@/lib/useLockScroll'

type WeightUnit = 'lbs' | 'kg'

/** Module-level: once answered (or found already-decided) in this tab, never
 *  asked again for the life of the bundle, whichever mount point asks. */
let settled = false

export default function WeightUnitGate() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<WeightUnit | null>(null)
  const [error, setError] = useState<string | null>(null)
  useLockScroll(open)

  useEffect(() => {
    if (settled) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok || cancelled) return
        const body = (await res.json().catch(() => null)) as { profile?: { weightUnit?: string } } | null
        if (cancelled || !body) return
        const decided = body.profile?.weightUnit === 'lbs' || body.profile?.weightUnit === 'kg'
        if (decided) {
          settled = true
          return
        }
        setOpen(true)
      } catch {
        // Fail open — see the header comment.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const choose = useCallback(async (unit: WeightUnit) => {
    if (busy) return
    setBusy(unit)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ profile: { weightUnit: unit } }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      settled = true
      setOpen(false)
    } catch {
      setError('That did not save. Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }, [busy])

  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="weight-unit-gate-title"
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      data-testid="weight-unit-gate"
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-zinc-900 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <h2 id="weight-unit-gate-title" className="text-lg font-bold text-zinc-900 dark:text-white">
          Pounds or kilograms?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Which unit do you lift in? This drives every weight you see and log — live
          workouts, history and personal records. You can change it later in Settings.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => choose('lbs')}
            disabled={busy !== null}
            data-testid="weight-unit-gate-lbs"
            className="rounded-xl border border-zinc-300 px-4 py-4 text-center text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800"
          >
            {busy === 'lbs' ? 'Saving…' : 'Pounds (lb)'}
          </button>
          <button
            type="button"
            onClick={() => choose('kg')}
            disabled={busy !== null}
            data-testid="weight-unit-gate-kg"
            className="rounded-xl border border-zinc-300 px-4 py-4 text-center text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800"
          >
            {busy === 'kg' ? 'Saving…' : 'Kilograms (kg)'}
          </button>
        </div>
      </div>
    </div>
  )
}
