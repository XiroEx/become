'use client'

// Creates a public share link for a program / workout / one-off session and
// shows a sheet to copy the link or export the snapshot as JSON.

import { useState } from 'react'
import { Share2, Copy, Check, Download, X, Loader2 } from 'lucide-react'

interface ShareButtonProps {
  kind: 'program' | 'workout' | 'session'
  programId?: string
  day?: string
  phase?: string
  /** For one-off/generated sessions — the content to snapshot. Exercises are a
   *  loose draft shape; the server sanitizes them. */
  session?: { title: string; focus?: string; exercises: unknown[] }
  label?: string
  className?: string
}

export default function ShareButton({ kind, programId, day, phase, session, label = 'Share', className }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setOpen(true); setLoading(true); setError(null); setUrl(null); setShareId(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/share', { method: 'POST', headers, body: JSON.stringify({ kind, programId, day, phase, session }) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.shareId) { setError(data?.error || 'Could not create a share link.'); return }
      setShareId(data.shareId)
      setUrl(`${window.location.origin}${data.url}`)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  const exportJson = async () => {
    if (!shareId) return
    try {
      const res = await fetch(`/api/share/${shareId}`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${String(data.title || 'workout').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { /* ignore */ }
  }

  return (
    <>
      <button
        type="button"
        onClick={create}
        className={className || 'inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'}
      >
        <Share2 className="h-4 w-4" /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Share this {kind === 'program' ? 'program' : 'workout'}</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Anyone with the link can view it; they&apos;ll be prompted to log in to start it.</p>

            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
            ) : error ? (
              <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : url ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300">{url}</span>
                  <button onClick={copy} className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-black">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button onClick={exportJson} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                  <Download className="h-4 w-4" /> Export as JSON
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
