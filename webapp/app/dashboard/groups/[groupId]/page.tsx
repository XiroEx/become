'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { CommunityEvent, CommunityGroup, formatEventTime, getToken } from '@/components/community/types'

export default function GroupDetailPage() {
  const params = useParams<{ groupId: string }>()
  const [group, setGroup] = useState<CommunityGroup | null>(null)
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const token = getToken()
    if (!token || !params.groupId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${params.groupId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json() as { group: CommunityGroup; events: CommunityEvent[] }
        setGroup(data.group)
        setEvents(data.events)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [params.groupId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleJoin() {
    if (!group) return
    const token = getToken()
    if (!token) return
    const res = await fetch(`/api/groups/${group.slug}/join`, {
      method: group.isMember ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) load()
  }

  if (loading) return <PageTransition><div className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" /></PageTransition>
  if (!group) return <PageTransition><EmptyState title="Group not found" description="This group is unavailable or has been archived." /></PageTransition>

  return (
    <PageTransition>
      <div className="mb-5">
        <Link href="/dashboard/groups" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">Groups</Link>
        <div className="mt-2 flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">{group.name}</h1>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{group.description}</p>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={toggleJoin}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${group.isMember ? 'border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200' : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'}`}
          >
            {group.isMember ? 'Leave group' : 'Join group'}
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{group.memberCount} members</span>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">Group Events</h2>
        {events.length === 0 ? (
          <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No events scheduled" description="Upcoming group events will appear here." />
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <Card key={event._id} as={Link} href={`/dashboard/events/${event.slug}`} className="block">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{event.title}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatEventTime(event.startsAt)}</p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </PageTransition>
  )
}
