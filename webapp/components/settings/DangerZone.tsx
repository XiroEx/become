'use client'

// THE DELETE-ACCOUNT CONTROL, AND WHY IT LOOKS LIKE THIS.
//
// Apple App Review 5.1.1(v) is checked BY HAND: a reviewer signs in, opens
// Settings, and looks for a way to delete the account without leaving the app
// and without being told to send an email. If they cannot find it, the build is
// rejected — so this is rendered on the Settings screen ITSELF, outside the tab
// switcher, and not behind one of the three tabs. From Settings it is two taps:
// "Delete account", then "Delete my account" in the dialog. That is the whole
// path, and it is the same path on the web, on iOS and on Android.
//
// TWO TAPS, NOT ONE, AND NOT FOUR. One tap would let a thumb destroy a training
// history. Making somebody retype their email address (the pattern copied from
// developer consoles) reads as an obstacle, and an obstacle is exactly what the
// guideline forbids. So: a dialog that states the consequences in full, with a
// destructive button and a way out, and nothing else in between.
//
// The undo is a seven-day window, not a confirmation step — see
// lib/accountDeletion.ts. That is what makes two taps safe.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { getToken, logout } from '@/lib/clientAuth'
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal'
// Constants only — lib/accountDeletion.ts deliberately imports no Node
// built-ins, so it is safe in a client bundle. The HMAC lives elsewhere.
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/accountDeletion'

interface DeletionStatusWire {
  requestedAt: string
  scheduledPurgeAt: string
  daysRemaining: number
}

interface AccountStatus {
  graceDays: number
  deletion: DeletionStatusWire | null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export interface DangerZoneProps {
  /** Injected in tests; defaults to the browser's. */
  fetchImpl?: typeof fetch
  /** Injected in tests; defaults to clearing the session and going to /login. */
  onSignedOut?: () => void
}

export default function DangerZone({ fetchImpl, onSignedOut }: DangerZoneProps = {}) {
  const doFetch: typeof fetch = fetchImpl ?? ((input, init) => fetch(input, init))
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<DeletionStatusWire | null>(null)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await doFetch('/api/me/account', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      setStatus((await res.json()) as AccountStatus)
    } catch {
      // A settings screen must still render when this read fails; the button
      // below works regardless, because the server is what decides.
    }
    // doFetch is rebuilt every render when no impl is injected; depending on it
    // would re-run this on every keystroke elsewhere on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const requestDeletion = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const res = await doFetch('/api/me/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source: 'web' }),
      })
      const data = (await res.json().catch(() => null)) as
        | { deletion?: DeletionStatusWire; error?: string }
        | null
      if (!res.ok || !data?.deletion) {
        setError('We could not start the deletion. Nothing has changed — please try again.')
        setBusy(false)
        return
      }
      setDone(data.deletion)
      setConfirming(false)
      // Signing the device out is part of the request, not a courtesy: the JWT
      // cannot be revoked server-side, so the client dropping it is what makes
      // "you are signed out everywhere" true on THIS device. Deferred a beat so
      // the confirmation is actually read before the redirect.
      setTimeout(() => {
        if (onSignedOut) return onSignedOut()
        logout()
        window.location.href = '/login?deleted=1'
      }, 4000)
    } catch {
      setError('We could not reach the server. Nothing has changed — please try again.')
      setBusy(false)
    }
  }, [doFetch, onSignedOut])

  const cancelDeletion = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const res = await doFetch('/api/me/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ intent: 'cancel' }),
      })
      if (!res.ok) {
        setError('We could not cancel the deletion. Please try again.')
      } else {
        setStatus((prev) => (prev ? { ...prev, deletion: null } : prev))
      }
    } catch {
      setError('We could not reach the server. Please try again.')
    }
    setBusy(false)
  }, [doFetch])

  const pending = status?.deletion ?? null
  const graceDays = status?.graceDays ?? ACCOUNT_DELETION_GRACE_DAYS

  return (
    <section
      id="danger-zone"
      data-testid="danger-zone"
      className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-900/50 dark:bg-zinc-900 sm:p-6"
    >
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-red-600 dark:text-red-400">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Danger zone
      </h2>

      {done ? (
        <div data-testid="deletion-scheduled">
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-200">
            Your account is scheduled for deletion on{' '}
            <strong>{formatDate(done.scheduledPurgeAt)}</strong>. We have signed you out, stopped
            every notification, and emailed you a link that undoes this if you change your mind.
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Signing you out…</p>
        </div>
      ) : pending ? (
        <div data-testid="deletion-pending">
          <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-200">
            This account is scheduled for deletion on{' '}
            <strong>{formatDate(pending.scheduledPurgeAt)}</strong> — {pending.daysRemaining}{' '}
            {pending.daysRemaining === 1 ? 'day' : 'days'} left. Nothing has been erased yet. Keeping
            it brings everything back; notifications stay off until you switch them on again.
          </p>
          <button
            type="button"
            data-testid="cancel-deletion"
            onClick={cancelDeletion}
            disabled={busy}
            className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {busy ? 'Working…' : 'Keep my account'}
          </button>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Deleting your account removes your profile, training, nutrition and mind history, and
            stops every notification straight away. You have {graceDays} days to change your mind
            before it becomes permanent. Cancel any paid plan first, or ask us to cancel it, so a
            renewal is not charged while the deletion is in progress.
          </p>
          <button
            type="button"
            data-testid="delete-account"
            onClick={() => setConfirming(true)}
            className="w-full rounded-xl border border-red-300 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Delete account
          </button>
        </>
      )}

      {error && (
        <p data-testid="danger-zone-error" role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Cannot get into the app on another device? The same request can be made at{' '}
        <a
          href="/delete-account"
          className="font-medium text-zinc-900 underline underline-offset-2 dark:text-white"
        >
          become.redbtn.io/delete-account
        </a>{' '}
        or by emailing{' '}
        <a
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          className="font-medium text-zinc-900 underline underline-offset-2 dark:text-white"
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          data-testid="delete-account-dialog"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-zinc-900 sm:p-6">
            <h3
              id="delete-account-title"
              className="text-lg font-bold text-zinc-900 dark:text-white"
            >
              Delete your account?
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              <li>You will be signed out on this device straight away.</li>
              <li>Every push notification on your account stops immediately.</li>
              <li>
                Your data is held for {graceDays} days and then erased permanently. We will email
                you a link that undoes this at any point before then.
              </li>
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                data-testid="delete-account-confirm"
                onClick={requestDeletion}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? 'Deleting…' : 'Delete my account'}
              </button>
              <button
                type="button"
                data-testid="delete-account-cancel"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="w-full rounded-xl border border-zinc-300 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Keep my account
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
