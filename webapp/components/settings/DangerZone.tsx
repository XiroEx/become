'use client'

// THE DELETE-ACCOUNT SURFACE. Settings → Delete account → confirm, and it is
// gone. Two taps, no email, no support ticket — which is exactly what App
// Store Review Guideline 5.1.1(v) asks a reviewer to check by hand and what
// the EU right to erasure expects to be as easy as signing up.
//
// Three things about it are deliberate:
//
//   • IT RENDERS OUTSIDE THE SETTINGS TAB SWITCHER. Behind a tab it is one tap
//     further and, worse, invisible to a reviewer who never guesses which of
//     three tabs hides it. `tests/unit/account/storeReadiness.test.tsx` pins
//     that placement.
//   • The confirmation is a second, destructive button — not a typed phrase.
//     The same component ships to a phone keyboard in the native builds
//     (expo/components/settings/DangerZone.tsx mirrors it), and the server
//     still requires the explicit confirmation constant, so nothing can delete
//     an account on an empty body.
//   • Success SIGNS THE DEVICE OUT. The session is worthless the moment the
//     request lands (the push registrations are already gone), and leaving a
//     member sitting in a dashboard belonging to an account that is being
//     deleted is the confusing half of every deletion flow that gets this
//     wrong.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, logout } from '@/lib/clientAuth'
import { clearAllCache } from '@/lib/clientCache'
import { DELETE_CONFIRMATION, RESTORE_WINDOW_DAYS, type DeletionStatus } from '@/lib/accountDeletion'
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal'

interface AccountStatusResponse {
  deletion: DeletionStatus
  covers: string[]
  exceptions: string[]
}

export default function DangerZone() {
  const router = useRouter()
  const [status, setStatus] = useState<DeletionStatus | null>(null)
  const [covers, setCovers] = useState<string[]>([])
  const [exceptions, setExceptions] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const token = getToken()
      if (!token) return
      const res = await fetch('/api/me/account', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      })
      if (!res.ok) return
      const data = (await res.json()) as AccountStatusResponse
      setStatus(data.deletion)
      setCovers(data.covers ?? [])
      setExceptions(data.exceptions ?? [])
    } catch {
      // A failed read leaves the button drawn and the server as the gate. The
      // one thing that must never happen here is the surface disappearing
      // because a fetch blipped.
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function requestDeletion() {
    setBusy(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch('/api/me/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ confirm: DELETE_CONFIRMATION, source: 'web' }),
      })
      if (!res.ok) {
        setError('We could not start the deletion. Try again, or email ' + LEGAL_CONTACT_EMAIL + '.')
        setBusy(false)
        return
      }
      // Sign this device out, the same way the profile menu does, and land on
      // the public page that explains what happens next — which is readable
      // signed out, because by now they are.
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
      logout()
      clearAllCache()
      router.push('/delete-account?requested=1')
    } catch {
      setError('We could not start the deletion. Try again, or email ' + LEGAL_CONTACT_EMAIL + '.')
      setBusy(false)
    }
  }

  async function cancelDeletion() {
    setBusy(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch('/api/me/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ cancel: true }),
      })
      if (!res.ok) {
        setError('We could not cancel it. Try again, or email ' + LEGAL_CONTACT_EMAIL + '.')
      } else {
        await load()
      }
    } catch {
      setError('We could not cancel it. Try again, or email ' + LEGAL_CONTACT_EMAIL + '.')
    } finally {
      setBusy(false)
    }
  }

  const pending = status?.pending === true

  return (
    <section
      id="delete-account"
      data-testid="danger-zone"
      className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-900/50 dark:bg-zinc-900 sm:p-6"
    >
      <h2 className="mb-1 text-base font-semibold text-red-600 dark:text-red-400">Delete account</h2>

      {pending ? (
        <>
          <p data-testid="deletion-pending" className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
            Your account is scheduled for deletion. Everything below is permanently removed on{' '}
            <strong>
              {status?.restorableUntil
                ? new Date(status.restorableUntil).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'the scheduled date'}
            </strong>
            {status && status.daysLeft > 0 ? ` — ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} from now` : ''}.
            We emailed you a link that does the same thing as the button below.
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
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            This deletes your account and the data attached to it. You have {RESTORE_WINDOW_DAYS} days to
            change your mind — after that it cannot be undone.
          </p>

          {covers.length > 0 && (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
              {covers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {exceptions.length > 0 && (
            <details className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              <summary className="cursor-pointer">What does not simply disappear</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {exceptions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}

          {confirming ? (
            <div className="space-y-2">
              <p data-testid="delete-confirm-prompt" className="text-sm font-medium text-zinc-900 dark:text-white">
                Delete your account? You will be signed out, and your devices stop getting notifications
                immediately.
              </p>
              <button
                type="button"
                data-testid="confirm-delete-account"
                onClick={requestDeletion}
                disabled={busy}
                className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="w-full rounded-xl border border-zinc-200 py-3 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="delete-account"
              onClick={() => setConfirming(true)}
              className="w-full rounded-xl border border-red-300 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Delete account
            </button>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
