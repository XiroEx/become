"use client"

// PUBLIC, unauthenticated viewer for a shared Mind session / program. Lives
// OUTSIDE /dashboard so AuthGuard never runs. Renders the session(s) read-only
// via SessionPlayer in gated mode — any interaction prompts sign-in to Become.

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Lock, ArrowRight, Sparkles } from 'lucide-react'
import SessionPlayer from '@/components/mind/session/SessionPlayer'
import type { MindSessionPlan } from '@/lib/mind/moves'

interface ShareEntry { title: string | null; plan: MindSessionPlan }
interface ShareData {
  kind: 'session' | 'program'
  title: string
  description: string | null
  sharedBy: string | null
  sessions: ShareEntry[]
  createdAt: string | null
}

export default function SharedSessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<ShareData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/share/mind/${token}`)
        if (!res.ok) { if (alive) setStatus('notfound'); return }
        const d: ShareData = await res.json()
        if (!alive) return
        setData(d)
        setStatus('ready')
        // A single-session share opens straight into the (gated) player.
        if (d.kind !== 'program' && d.sessions.length === 1) setActiveIdx(0)
      } catch {
        if (alive) setStatus('notfound')
      }
    })()
    return () => { alive = false }
  }, [token])

  // Continue/login CTA — Become is the destination. Deep-resume isn't supported
  // yet, so we route to register/login; the share link is preserved for sharing.
  const next = encodeURIComponent(`/share/mind/${token}`)

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (status === 'notfound' || !data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center">
        <p className="text-lg font-semibold text-white">This shared session isn&apos;t available.</p>
        <p className="text-sm text-zinc-400">The link may be wrong or was removed.</p>
        <Link href="/" className="mt-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">Go to Become</Link>
      </div>
    )
  }

  const active = activeIdx != null ? data.sessions[activeIdx] : null

  return (
    <div className="relative min-h-dvh bg-zinc-950 text-white">
      {/* Top bar — Become brand + who shared it */}
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-bold tracking-tight">BECOME</span>
        {data.sharedBy && <span className="text-xs text-zinc-400">Shared by {data.sharedBy}</span>}
      </header>

      {active ? (
        // Gated player — read-only; interaction → auth prompt.
        <div className="mx-auto max-w-md">
          <SessionPlayer
            plan={active.plan}
            gated
            onRequireAuth={() => setShowAuth(true)}
            onExit={() => (data.kind === 'program' ? setActiveIdx(null) : setShowAuth(true))}
          />
        </div>
      ) : (
        // Program overview — list the sessions; tap to preview one (gated).
        <div className="mx-auto max-w-md px-4 py-6">
          <h1 className="text-2xl font-bold">{data.title}</h1>
          {data.description && <p className="mt-1 text-sm text-zinc-400">{data.description}</p>}
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
            {data.sessions.length} session{data.sessions.length === 1 ? '' : 's'} · preview
          </p>
          <div className="mt-4 space-y-2">
            {data.sessions.map((s, i) => {
              const planTitle = s.title || s.plan?.intro?.title || `Session ${i + 1}`
              const count = s.plan?.moves?.length ?? 0
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{planTitle}</p>
                    <p className="text-xs text-zinc-400">{count} move{count === 1 ? '' : 's'}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Persistent CTA — Become is the only way to actually do the session. */}
      <div className="sticky bottom-0 border-t border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <Link
          href={`/register?next=${next}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-bold text-black transition-colors hover:bg-zinc-200"
        >
          <Sparkles className="h-4 w-4" /> Do this session in Become
        </Link>
      </div>

      {/* Auth gate — shown when the viewer tries to interact. */}
      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setShowAuth(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <Lock className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-bold">Log in to continue</h2>
            <p className="mt-1.5 text-sm text-zinc-400">Create a free Become account to actually run this session and track your progress.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/register?next=${next}`} className="rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-zinc-200">Sign up free</Link>
              <Link href={`/login?next=${next}`} className="rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white hover:bg-white/5">Log in</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
