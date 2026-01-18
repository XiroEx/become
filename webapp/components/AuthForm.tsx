"use client"
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

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
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

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

      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
    </form>
  )
}
