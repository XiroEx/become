'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, MessageCircle, Users, ArrowRight } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card } from '@/components/ui'
import { CommunityEvent, CommunityGroup, formatEventTime, getToken } from '@/components/community/types'

export default function CommunityPage() {
  const [groups, setGroups] = useState<CommunityGroup[]>([])
  const [events, setEvents] = useState<CommunityEvent[]>([])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    Promise.all([
      fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.ok ? res.json() : { groups: [] }),
      fetch('/api/events', { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.ok ? res.json() : { events: [] }),
    ]).then(([groupData, eventData]) => {
      setGroups(groupData.groups ?? [])
      setEvents((eventData.events ?? []).slice(0, 3))
    })
  }, [])

  const tiles = [
    { href: '/dashboard/events', label: 'Events', icon: CalendarDays, value: `${events.length} upcoming`, body: 'Workshops, check-ins, and live sessions.' },
    { href: '/dashboard/groups', label: 'Groups', icon: Users, value: `${groups.length} active`, body: 'Focused spaces for goals, programs, and accountability.' },
    { href: '/dashboard/chat', label: 'Chats', icon: MessageCircle, value: 'Direct messages', body: 'Private conversations with coaches and community members.' },
  ]

  return (
    <PageTransition>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">Community</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Events, groups, and chats in one place.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-tour="community-tiles">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <Card key={tile.href} as={Link} href={tile.href} className="block transition hover:border-zinc-300 hover:shadow-sm dark:hover:border-zinc-700">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowRight className="h-4 w-4 text-zinc-400" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-zinc-900 dark:text-white">{tile.label}</h2>
              <p className="mt-1 text-xs font-medium uppercase text-zinc-400">{tile.value}</p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{tile.body}</p>
            </Card>
          )
        })}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section data-tour="community-events">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Upcoming Events</h2>
            <Link href="/dashboard/events" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">View all</Link>
          </div>
          <div className="space-y-2">
            {events.length === 0 ? (
              <Card className="text-sm text-zinc-500 dark:text-zinc-400">No published events yet.</Card>
            ) : events.map((event) => (
              <Card key={event._id} as={Link} href={`/dashboard/events/${event.slug}`} variant="compact" className="block">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{event.title}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatEventTime(event.startsAt)}</p>
              </Card>
            ))}
          </div>
        </section>
        <section data-tour="community-groups">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Groups</h2>
            <Link href="/dashboard/groups" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">View all</Link>
          </div>
          <div className="space-y-2">
            {groups.slice(0, 3).map((group) => (
              <Card key={group._id} as={Link} href={`/dashboard/groups/${group.slug}`} variant="compact" className="block">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{group.name}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{group.memberCount} members</p>
              </Card>
            ))}
            {groups.length === 0 ? <Card className="text-sm text-zinc-500 dark:text-zinc-400">No active groups yet.</Card> : null}
          </div>
        </section>
      </div>
    </PageTransition>
  )
}
