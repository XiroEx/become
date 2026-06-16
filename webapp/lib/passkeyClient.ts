// Browser-side passkey (WebAuthn) ceremonies. Talks to the /api/auth/passkey/*
// routes and runs the actual credential create/get via @simplewebauthn/browser.

import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { getToken } from '@/lib/clientAuth'

/** True if this browser can do WebAuthn at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

/** Pull a human-readable error message out of a non-OK API response. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (data && typeof data.error === 'string' && data.error) return data.error
  } catch {
    // non-JSON body — fall through
  }
  return fallback
}

/** Enroll a passkey for the currently-signed-in Become user. */
export async function registerPasskey(): Promise<void> {
  const token = getToken()
  const optRes = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
  })
  if (!optRes.ok) throw new Error(await readError(optRes, 'Could not start passkey setup'))
  const { options, challengeId } = await optRes.json()

  // startRegistration throws native WebAuthn errors (NotAllowedError,
  // InvalidStateError, NotSupportedError, SecurityError…) with a .name — let
  // those propagate unchanged so the caller can explain them.
  const response = await startRegistration({ optionsJSON: options })

  const verifyRes = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
    body: JSON.stringify({ challengeId, response }),
  })
  if (!verifyRes.ok) throw new Error(await readError(verifyRes, 'Passkey setup failed'))
}

/** Sign in with a passkey. Stores the Become token and returns it. */
export async function loginWithPasskey(email?: string): Promise<{ token: string }> {
  const optRes = await fetch('/api/auth/passkey/authenticate/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { email } : {}),
  })
  if (!optRes.ok) throw new Error('No passkey available')
  const { options, challengeId } = await optRes.json()

  const response = await startAuthentication({ optionsJSON: options })

  const verifyRes = await fetch('/api/auth/passkey/authenticate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, response }),
  })
  if (!verifyRes.ok) throw new Error('Passkey sign-in failed')
  const data = (await verifyRes.json()) as { token: string }
  if (typeof window !== 'undefined' && data.token) {
    localStorage.setItem('token', data.token)
  }
  return data
}
