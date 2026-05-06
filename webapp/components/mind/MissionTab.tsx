'use client'

import { useState, useEffect } from 'react'
import { BookOpen, Edit2, CheckCircle2 } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import { getPiecesBySection } from '@/lib/mindContent'

interface Mission {
  purpose: string
  whyItMatters: string
  dailyAction: string
}

export default function MissionTab() {
  const [mission, setMission] = useState<Mission | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState<Mission>({ purpose: '', whyItMatters: '', dailyAction: '' })

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }

    fetch('/api/mind/mission', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.mission) {
          setMission(data.mission)
          setForm(data.mission)
        } else {
          setEditing(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!form.purpose.trim() || !form.whyItMatters.trim() || !form.dailyAction.trim()) return
    setSaving(true)
    try {
      const token = getToken()
      const res = await fetch('/api/mind/mission', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const data = await res.json()
        setMission(data.mission)
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header context */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Your Mission</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              A mission gives every sacrifice a reason. Without one, discipline becomes white-knuckle willpower — unsustainable. With one, hard choices get easier because they align with something that matters.
            </p>
          </div>
        </div>
      </div>

      {/* Mission display or form */}
      {mission && !editing ? (
        <>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Your Purpose</p>
              <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                <Edit2 className="h-3.5 w-3.5" /> Edit
              </button>
            </div>
            <p className="mb-5 text-base font-semibold leading-snug text-zinc-900 dark:text-white">
              {mission.purpose}
            </p>

            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Why It Matters</p>
            <p className="mb-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {mission.whyItMatters}
            </p>

            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Daily Action</p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">{mission.dailyAction}</p>
            </div>
          </div>

          {saved && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Mission saved.</span>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <p className="mb-4 text-sm font-semibold text-zinc-900 dark:text-white">
            {mission ? 'Update your mission' : 'Define your mission'}
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Your Purpose
              </label>
              <textarea
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="I am training because..."
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Why It Matters
              </label>
              <textarea
                value={form.whyItMatters}
                onChange={(e) => setForm((f) => ({ ...f, whyItMatters: e.target.value }))}
                placeholder="The real reason this matters to me is..."
                rows={3}
                maxLength={1000}
                className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Daily Action
              </label>
              <input
                type="text"
                value={form.dailyAction}
                onChange={(e) => setForm((f) => ({ ...f, dailyAction: e.target.value }))}
                placeholder="The one thing I do every day..."
                maxLength={300}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !form.purpose.trim() || !form.whyItMatters.trim() || !form.dailyAction.trim()}
                className="flex-1 rounded-xl bg-zinc-900 dark:bg-white py-3 text-sm font-semibold text-white dark:text-zinc-900 transition-opacity disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save Mission'}
              </button>
              {mission && (
                <button
                  onClick={() => { setEditing(false); setForm(mission) }}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mission protocols */}
      <MissionProtocols />
    </div>
  )
}

const MISSION_PROTOCOLS = getPiecesBySection('mission')

function MissionProtocols() {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Mission Protocols
      </p>
      <p className="mb-4 text-sm text-zinc-500">Clarity exercises. Use when you feel scattered or lost.</p>
      <div className="space-y-2">
        {MISSION_PROTOCOLS.map((p) => (
          <div key={p.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-white">{p.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{p.source}</p>
              </div>
              <span className="text-zinc-400 text-lg ml-2 shrink-0">{expanded === p.id ? '−' : '+'}</span>
            </button>
            {expanded === p.id && (
              <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 pb-4 pt-3 bg-zinc-50 dark:bg-zinc-800/30">
                <p className="text-sm font-semibold italic text-zinc-800 dark:text-zinc-200 mb-3">
                  &ldquo;{p.mantra}&rdquo;
                </p>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p.instruction}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
