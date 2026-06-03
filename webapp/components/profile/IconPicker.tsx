'use client'

// Self-contained profile-icon chooser. Shows the current avatar large, then a
// grid of preset icons; tapping one saves it (optimistically) via PATCH
// /api/profile. Custom image upload + earned/locked icons (redReward) layer in
// later — this is the Phase-1 preset swapper.

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { PRESET_ICONS } from '@/lib/reward/icons'
import { getToken } from '@/lib/clientAuth'

export default function IconPicker() {
  const [current, setCurrent] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
        if (res.ok) {
          const data = await res.json()
          setCurrent(data.profileIcon ?? null)
          setAvatarUrl(data.avatarUrl ?? null)
        }
      } catch {
        /* ignore */
      } finally {
        setLoaded(true)
      }
    })()
  }, [])

  async function pick(id: string) {
    if (id === current || saving) return
    const prev = current
    setCurrent(id) // optimistic
    setSaving(id)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({ profileIcon: id }),
      })
      if (!res.ok) setCurrent(prev) // revert on failure
    } catch {
      setCurrent(prev)
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-4">
        <Avatar icon={current} imageUrl={avatarUrl} size={56} />
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Profile icon</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Pick one that feels like you.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-5 gap-3 sm:grid-cols-6">
        {PRESET_ICONS.map((p) => {
          const selected = current === p.id
          return (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              disabled={!loaded}
              aria-label={p.label}
              aria-pressed={selected}
              className={`relative aspect-square rounded-full transition-transform active:scale-95 ${
                selected ? 'ring-2 ring-offset-2 ring-zinc-900 ring-offset-white dark:ring-white dark:ring-offset-zinc-900' : ''
              }`}
            >
              <Avatar icon={p.id} size={48} className="mx-auto" />
              {selected && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
