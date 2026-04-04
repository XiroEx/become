"use client"
import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface AuthGuardProps {
  children: React.ReactNode
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token')

    if (token) {
      // Validate the token locally first
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const exp = payload.exp * 1000 // Convert to milliseconds
        if (Date.now() >= exp) {
          // Token expired
          localStorage.removeItem('token')
          router.replace('/login')
          return
        }
        // Token is valid — check onboarding status only for /dashboard/* paths
        if (pathname?.startsWith('/dashboard')) {
          try {
            const profileRes = await fetch('/api/profile', {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (profileRes.ok) {
              const data = await profileRes.json()
              if (data.onboardingCompleted === false) {
                router.replace('/onboarding')
                return
              }
            }
          } catch {
            // Non-critical — if profile fetch fails, allow access
          }
        }
        setIsAuthenticated(true)
        return
      } catch {
        // Invalid token format, clear it
        localStorage.removeItem('token')
      }
    }

    // No valid localStorage token - check if we have a cookie-based session
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include' // Include cookies
      })

      if (res.ok) {
        const data = await res.json()
        // If server returned a token (from cookie), sync to localStorage
        if (data.token) {
          localStorage.setItem('token', data.token)
        }

        // Check onboarding status for /dashboard/* paths
        if (pathname?.startsWith('/dashboard')) {
          const syncedToken = data.token || localStorage.getItem('token')
          if (syncedToken) {
            try {
              const profileRes = await fetch('/api/profile', {
                headers: { Authorization: `Bearer ${syncedToken}` },
              })
              if (profileRes.ok) {
                const profileData = await profileRes.json()
                if (profileData.onboardingCompleted === false) {
                  router.replace('/onboarding')
                  return
                }
              }
            } catch {
              // Non-critical — allow access on error
            }
          }
        }

        setIsAuthenticated(true)
      } else {
        router.replace('/login')
      }
    } catch {
      router.replace('/login')
    }
  }, [router, pathname])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900"></div>
      </div>
    )
  }

  return <>{children}</>
}
