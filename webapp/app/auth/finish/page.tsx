'use client'

// Lands here after an OAuth callback, or after a one-time hand-off code is
// redeemed at /auth/handoff. The Become JWT arrives in the URL fragment (so it
// never hit the server); we move it into localStorage — the same place
// magic-link login stores it — strip it from the URL, and head on.
//
// `?next=` says where "on" is. It is put through the hand-off allow-list rather
// than trusted, so this page cannot be used as an open redirect by anyone who
// can get a member to open a link: anything that is not an allow-listed Become
// path falls back to /dashboard.
//
// `window.location` rather than `useSearchParams()` on purpose: the hash is
// only readable that way anyway, and reading both from one place keeps this
// page out of the Suspense boundary that hook would require.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { normalizeHandoffPath } from '@/lib/authHandoff'

export default function AuthFinishPage() {
  const router = useRouter()

  useEffect(() => {
    const href = typeof window !== 'undefined' ? window.location.href : ''
    let next = '/dashboard'
    if (href) {
      const url = new URL(href)
      const hash = url.hash.slice(1)
      if (hash) {
        try {
          localStorage.setItem('token', decodeURIComponent(hash))
        } catch {
          /* ignore */
        }
      }
      next = normalizeHandoffPath(url.searchParams.get('next')) ?? '/dashboard'
      // Remove the token (and the target) from the address bar / history.
      window.history.replaceState(null, '', '/auth/finish')
    }
    router.replace(next)
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-white/60">
      Signing you in…
    </div>
  )
}
