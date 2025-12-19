"use client"
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  mode: 'login' | 'register'
}

export default function AuthForm({ mode }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // TODO: Send email with code
      // For now, just simulate sending and set codeSent to true
      await new Promise(resolve => setTimeout(resolve, 500))
      setCodeSent(true)
    } catch (err: any) {
      setError(err.message || 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Verify code is 1234
      if (code !== '1234') {
        throw new Error('Invalid code. Use 1234 for testing.')
      }

      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Unknown error')

      // Save token and redirect to dashboard
      if (data.token) {
        localStorage.setItem('token', data.token)
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  if (!codeSent) {
    return (
      <form onSubmit={handleSendCode} className="flex w-full max-w-md flex-col gap-4">
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

        <button disabled={loading} className="cursor-pointer rounded bg-foreground px-4 py-2 text-background disabled:cursor-not-allowed">
          {loading ? 'Sending...' : 'Send code'}
        </button>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </form>
    )
  }

  return (
    <form onSubmit={handleVerifyCode} className="flex w-full max-w-md flex-col gap-4">
      <div className="rounded-lg bg-zinc-100 p-4 text-sm text-zinc-700">
        Code sent to <strong>{email}</strong>
        <button
          type="button"
          onClick={() => setCodeSent(false)}
          className="ml-2 cursor-pointer text-foreground underline"
        >
          Change
        </button>
      </div>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter 4-digit code"
        type="text"
        maxLength={4}
        pattern="[0-9]{4}"
        required
        className="rounded border px-3 py-2 text-center text-2xl tracking-widest"
      />

      <p className="text-xs text-zinc-500">
        For testing, use code: <strong>1234</strong>
      </p>

      <button disabled={loading} className="cursor-pointer rounded bg-foreground px-4 py-2 text-background disabled:cursor-not-allowed">
        {loading ? 'Verifying...' : 'Verify code'}
      </button>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </form>
  )
}
