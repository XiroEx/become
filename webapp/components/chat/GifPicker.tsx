'use client'

// GIF picker — search/trending GIFs (via /api/chat/gifs → GIPHY) and pick one to
// send. A bottom sheet; tapping a GIF calls onSelect(url) with the GIF's URL,
// which the chat sends as a message imageUrl. Required GIPHY attribution shown.

import { useEffect, useRef, useState } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

interface Gif {
  id: string
  title: string
  url: string
  preview: string
  width?: number
  height?: number
}

export default function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState<Gif[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced search (trending when empty).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chat/gifs?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
        })
        const data = await res.json()
        if (cancelled) return
        if (res.status === 503) {
          setError('GIF search isn’t set up yet.')
          setGifs([])
        } else if (!res.ok) {
          setError('Couldn’t load GIFs. Try again.')
          setGifs([])
        } else {
          setGifs(data.gifs || [])
        }
      } catch {
        if (!cancelled) {
          setError('Couldn’t load GIFs. Try again.')
          setGifs([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, query.trim() ? 350 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] flex-col rounded-t-2xl bg-white dark:bg-zinc-900"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
      >
        {/* Header / search */}
        <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs"
              className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          ) : gifs.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">No GIFs found.</p>
          ) : (
            <div className="columns-2 gap-2 sm:columns-3">
              {gifs.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onSelect(g.url)}
                  className="mb-2 block w-full overflow-hidden rounded-lg bg-zinc-100 active:scale-95 dark:bg-zinc-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.preview} alt={g.title} loading="lazy" className="w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="pb-2 text-center text-[10px] uppercase tracking-wider text-zinc-400">Powered by GIPHY</p>
      </div>
    </div>
  )
}
