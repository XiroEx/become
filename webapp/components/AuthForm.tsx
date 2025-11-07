"use client"
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  mode: 'login' | 'register'
}

export default function AuthForm({ mode }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Unknown error')

      // Save token and redirect to dashboard
      if (data.token) {
        localStorage.setItem('token', data.token)
      }
      router.push('/dashboard/programming')
    } catch (err: any) {
      setError(err.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
      {mode === 'register' && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
          className="rounded border px-3 py-2"
        />
      )}

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        type="email"
        required
        className="rounded border px-3 py-2"
      />

      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
        required
        className="rounded border px-3 py-2"
      />

      <button disabled={loading} className="rounded bg-foreground px-4 py-2 text-background">
        {loading ? 'Working...' : mode === 'register' ? 'Create account' : 'Sign in'}
      </button>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </form>
  )
}
