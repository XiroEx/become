'use client'

// Lands here after an OAuth callback. The Become JWT arrives in the URL fragment
// (so it never hit the server); we move it into localStorage — the same place
// magic-link login stores it — strip it from the URL, and head to the dashboard.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthFinishPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    if (hash) {
      try {
        localStorage.setItem('token', decodeURIComponent(hash))
      } catch {
        /* ignore */
      }
      // Remove the token from the address bar / history.
      window.history.replaceState(null, '', '/auth/finish')
    }
    router.replace('/dashboard')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-white/60">
      Signing you in…
    </div>
  )
}
