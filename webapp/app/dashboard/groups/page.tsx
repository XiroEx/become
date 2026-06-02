'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, ArrowRight } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { CommunityGroup, getToken } from '@/components/community/types'

export default function GroupsPage() {
  const [groups, setGroups] = useState<CommunityGroup[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json() as { groups: CommunityGroup[] }
        setGroups(data.groups)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleJoin(group: CommunityGroup) {
    const token = getToken()
    if (!token) return
    const res = await fetch(`/api/groups/${group.slug}/join`, {
      method: group.isMember ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) load()
  }

  return (
    <PageTransition>
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">Groups</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Join focused community spaces for shared goals and accountability.</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />)}</div>
      ) : groups.length === 0 ? (
        <EmptyState icon={<Users className="h-7 w-7" />} title="No groups yet" description="Active community groups will appear here." />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group._id}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/dashboard/groups/${group.slug}`} className="text-base font-semibold text-zinc-900 hover:underline dark:text-white">{group.name}</Link>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{group.memberCount} members</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{group.description}</p>
                  {group.tags?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {group.tags.map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{tag}</span>)}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => toggleJoin(group)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${group.isMember ? 'border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200' : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'}`}
                >
                  {group.isMember ? 'Leave' : 'Join'}
                </button>
                <Link href={`/dashboard/groups/${group.slug}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  Open <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  )
}
