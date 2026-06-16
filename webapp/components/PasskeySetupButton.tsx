'use client'

// "Add a passkey" — enrolls a passkey for the signed-in Become user, so they can
// sign in with Face ID / Touch ID / a security key next time. Self-contained:
// shows its own inline status. Hidden on browsers without WebAuthn.

import { useEffect, useState } from 'react'
import { registerPasskey, passkeysSupported } from '@/lib/passkeyClient'

// Turn a passkey ceremony failure into something the user can act on. WebAuthn
// throws DOMExceptions with a stable `.name`; server-side failures arrive as a
// plain Error whose message we forward verbatim.
function describePasskeyError(err: unknown): string {
  const e = err as { name?: string; message?: string }
  switch (e?.name) {
    case 'NotAllowedError':
      return 'Passkey setup was cancelled or timed out. Make sure your device has Face ID / Touch ID or a screen lock set up, then try again.'
    case 'InvalidStateError':
      return 'A passkey for this account already exists on this device.'
    case 'NotSupportedError':
      return 'This device or browser does not support passkeys.'
    case 'SecurityError':
      return 'Passkeys are unavailable here. Open Become at https://become.redbtn.io in Safari or Chrome (not an in-app browser) and try again.'
    case 'AbortError':
      return 'Passkey setup was cancelled.'
  }
  return e?.message ? `Could not add a passkey: ${e.message}` : 'Could not add a passkey. Please try again.'
}

export default function PasskeySetupButton() {
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setSupported(passkeysSupported())
  }, [])

  if (!supported) return null

  async function add() {
    if (busy) return
    setStatus(null)
    setBusy(true)
    try {
      await registerPasskey()
      setStatus({ ok: true, msg: 'Passkey added. You can use it to sign in next time.' })
    } catch (err) {
      console.error('passkey registration failed:', err)
      setStatus({ ok: false, msg: describePasskeyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Passkey</label>
      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 18v3h6v-3a3 3 0 0 0-6 0z" />
          <circle cx="5" cy="11" r="3" />
          <path d="M12 9h9M18 9v4M21 9v3" />
        </svg>
        {busy ? 'Follow your device prompt…' : 'Add a passkey'}
      </button>
      {status && (
        <p className={`mt-1 text-xs ${status.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {status.msg}
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Sign in with Face ID, Touch ID, or a security key.</p>
    </div>
  )
}
