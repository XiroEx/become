'use client'

// Self-contained profile-icon chooser. Shows the current avatar large, then a
// grid of preset icons; tapping one saves it (optimistically) via PATCH
// /api/profile. Custom image upload + earned/locked icons (redReward) layer in
// later — this is the Phase-1 preset swapper.

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Upload } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { PRESET_ICONS } from '@/lib/reward/icons'
import { getToken } from '@/lib/clientAuth'

export default function IconPicker() {
  const [current, setCurrent] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Upload failed')
        return
      }
      setAvatarUrl(data.avatarUrl)
      setCurrent('custom')
    } catch {
      setError('Upload failed')
    } finally {
      setUploading(false)
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

        {/* Upload custom */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Upload a custom photo"
          className={`flex aspect-square items-center justify-center rounded-full border-2 border-dashed transition-colors ${
            current === 'custom'
              ? 'border-zinc-900 dark:border-white'
              : 'border-zinc-300 text-zinc-400 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500'
          }`}
          style={{ width: 48, height: 48 }}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : current === 'custom' && avatarUrl ? (
            <Avatar icon="custom" imageUrl={avatarUrl} size={44} />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} className="hidden" />
      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">Or upload your own — JPG, PNG, WebP or GIF, up to 5MB.</p>
    </section>
  )
}
