"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AuthGuardProps {
  children: React.ReactNode
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
    } else {
      // Optionally validate the token here
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const exp = payload.exp * 1000 // Convert to milliseconds
        if (Date.now() >= exp) {
          // Token expired
          localStorage.removeItem('token')
          router.replace('/login')
        } else {
          setIsAuthenticated(true)
        }
      } catch {
        // Invalid token
        localStorage.removeItem('token')
        router.replace('/login')
      }
    }
  }, [router])

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
