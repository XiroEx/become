"use client"

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'

function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const mode = searchParams.get('mode')
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(3)
  const [isPWA, setIsPWA] = useState(false)

  // Detect if running as installed PWA
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
      || document.referrer.includes('android-app://')
    setIsPWA(isStandalone)
  }, [])

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('No verification token provided.')
      return
    }

    async function verify() {
      try {
        const res = await fetch('/api/auth/verify-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.message || 'Verification failed')
        }

        // Save the JWT token
        if (data.token) {
          localStorage.setItem('token', data.token)
        }

        setStatus('success')
      } catch (err: unknown) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Verification failed')
      }
    }

    verify()
  }, [token])

  // Auto-close tab or redirect after countdown
  useEffect(() => {
    if (status !== 'success') return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          if (isPWA) {
            // In PWA, redirect since original instance is likely closed
            window.location.href = '/dashboard'
          } else {
            // In browser, try to close this tab - polling in original tab handles auth
            // window.close() only works for tabs opened by script, but we try anyway
            window.close()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [status, isPWA])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-6">
      <PageTransition className="w-full max-w-md">
        <div className="rounded-lg bg-white dark:bg-zinc-900 p-8 shadow dark:border dark:border-zinc-800 text-center">
          {status === 'verifying' && (
            <>
              <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white"></div>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                Verifying your email...
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Please wait a moment.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                {mode === 'register' ? 'Account created!' : 'Signed in!'}
              </h1>
              {isPWA ? (
                <>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                    Redirecting to your dashboard...
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    Redirecting in {countdown}...
                  </p>
                </>
              ) : (
                <>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                    You're all set! This tab will close in {countdown}s...
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    Return to your original tab to continue.
                  </p>
                </>
              )}
              <Link 
                href="/dashboard" 
                className="mt-4 inline-block text-sm font-medium text-zinc-900 dark:text-white underline"
              >
                Go to dashboard
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                Verification failed
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                {error || 'Something went wrong. Please try again.'}
              </p>
              <Link 
                href="/login" 
                className="inline-block rounded-lg bg-zinc-900 dark:bg-white px-6 py-3 text-sm font-medium text-white dark:text-zinc-900"
              >
                Try again
              </Link>
            </>
          )}
        </div>
      </PageTransition>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-6">
        <div className="w-full max-w-md">
          <div className="rounded-lg bg-white dark:bg-zinc-900 p-8 shadow dark:border dark:border-zinc-800 text-center">
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white"></div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
              Loading...
            </h1>
          </div>
        </div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}
