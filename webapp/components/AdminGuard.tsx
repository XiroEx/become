'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AdminGuardProps {
  children: React.ReactNode
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const [status, setStatus] = useState<'loading' | 'authorized' | 'unauthorized'>('loading')
  const router = useRouter()

  useEffect(() => {
    async function checkAdmin() {
      const token = localStorage.getItem('token')

      if (!token) {
        router.replace('/dashboard')
        return
      }

      // Validate token expiry first
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (Date.now() >= payload.exp * 1000) {
          localStorage.removeItem('token')
          router.replace('/login')
          return
        }
      } catch {
        localStorage.removeItem('token')
        router.replace('/login')
        return
      }

      // Verify admin access by calling admin stats endpoint
      try {
        const res = await fetch(`/api/admin/stats?tz=${new Date().getTimezoneOffset()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          setStatus('authorized')
        } else if (res.status === 401) {
          router.replace('/login')
        } else if (res.status === 403) {
          router.replace('/dashboard')
        } else {
          router.replace('/dashboard')
        }
      } catch {
        router.replace('/dashboard')
      }
    }

    checkAdmin()
  }, [router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      </div>
    )
  }

  if (status === 'unauthorized') {
    return null
  }

  return <>{children}</>
}
