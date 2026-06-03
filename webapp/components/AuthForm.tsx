"use client"
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { loginWithPasskey, passkeysSupported } from '@/lib/passkeyClient'

interface Props {
  mode: 'login' | 'register'
}

export default function AuthForm({ mode }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [canPasskey, setCanPasskey] = useState(false)
  const submittingRef = useRef(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setCanPasskey(passkeysSupported())
  }, [])

  function handleGoogle() {
    window.location.href = '/api/auth/google'
  }

  async function handlePasskey() {
    if (passkeyBusy) return
    setError(null)
    setPasskeyBusy(true)
    try {
      await loginWithPasskey(email.trim() || undefined)
      router.push('/dashboard')
    } catch {
      setError('Could not sign in with a passkey. Try email, or add a passkey from your profile after signing in.')
    } finally {
      setPasskeyBusy(false)
    }
  }

  // Poll for verification status
  useEffect(() => {
    if (!sessionId || !emailSent) return

    const pollSession = async () => {
      try {
        const res = await fetch('/api/auth/check-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })

        const data = await res.json()

        if (data.status === 'verified' && data.authToken) {
          // Success! Store token and redirect
          localStorage.setItem('token', data.authToken)
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
          }
          router.push('/dashboard')
        } else if (data.status === 'expired') {
          // Link expired, stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
          }
          setError('Verification link expired. Please try again.')
          setEmailSent(false)
          setSessionId(null)
        }
        // If 'pending', keep polling
      } catch (err) {
        console.error('Polling error:', err)
      }
    }

    // Start polling every 2 seconds
    pollingRef.current = setInterval(pollSession, 2000)

    // Cleanup on unmount
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [sessionId, emailSent, router])

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, mode }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Failed to send verification email')
      }

      setSessionId(data.sessionId)
      setEmailSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  function handleChangeEmail() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }
    setEmailSent(false)
    setSessionId(null)
  }

  if (emailSent) {
    return (
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
            <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
            Check your email
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
            We sent a verification link to
          </p>
          <p className="text-sm font-medium text-zinc-900 dark:text-white mb-4">
            {email}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-2">
            Click the link in the email to {mode === 'register' ? 'complete your registration' : 'sign in'}.
            The link expires in 15 minutes.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
            Waiting for verification...
          </div>
        </div>

        <button
          type="button"
          onClick={handleChangeEmail}
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSendLink} className="flex w-full max-w-md flex-col gap-4">
      {mode === 'register' && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white placeholder:text-zinc-500"
        />
      )}

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        type="email"
        required
        className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white placeholder:text-zinc-500"
      />

      <button
        disabled={loading}
        className="cursor-pointer rounded bg-zinc-900 dark:bg-white px-4 py-2 text-white dark:text-zinc-900 font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Continue with email'}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="text-xs uppercase tracking-wide text-zinc-400">or</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        className="flex cursor-pointer items-center justify-center gap-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 font-medium text-zinc-900 dark:text-white transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Continue with Google
      </button>

      {/* Passkey */}
      {canPasskey && (
        <button
          type="button"
          onClick={handlePasskey}
          disabled={passkeyBusy}
          className="flex cursor-pointer items-center justify-center gap-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 font-medium text-zinc-900 dark:text-white transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 18v3h6v-3a3 3 0 0 0-6 0z" />
            <circle cx="5" cy="11" r="3" />
            <path d="M12 9h9M18 9v4M21 9v3" />
          </svg>
          {passkeyBusy ? 'Waiting for passkey…' : 'Sign in with a passkey'}
        </button>
      )}

      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
    </form>
  )
}
