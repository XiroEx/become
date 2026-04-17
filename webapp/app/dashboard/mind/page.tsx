'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import MindHub, { type SectionId } from '@/components/mind/MindHub'

export default function MindPage() {
  const router = useRouter()
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch('/api/streak', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.streakDays != null) setStreak(data.streakDays) })
      .catch(() => {})
  }, [])

  function handleNavigate(section: SectionId) {
    router.push(`/dashboard/mind/${section}`)
  }

  return (
    <PageTransition className="flex flex-col">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Mindset</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          The mind is the muscle. Train it like one.
        </p>
      </header>

      <div className="min-h-0 flex-1">
        <MindHub onNavigate={handleNavigate} streak={streak} />
      </div>
    </PageTransition>
  )
}
