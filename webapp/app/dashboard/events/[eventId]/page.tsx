'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CalendarDays, MapPin, Video } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { CommunityEvent, formatEventTime, getToken } from '@/components/community/types'
import FeatureGuard from '@/components/FeatureGuard'

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<CommunityEvent | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const token = getToken()
    if (!token || !params.eventId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${params.eventId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json() as { event: CommunityEvent }
        setEvent(data.event)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [params.eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleRsvp() {
    if (!event) return
    const token = getToken()
    if (!token) return
    const res = await fetch(`/api/events/${event.slug}/rsvp`, {
      method: event.isAttending ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) load()
  }

  const group = event && typeof event.groupId === 'object' ? event.groupId : null

  const content = loading ? (
    <PageTransition><div className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" /></PageTransition>
  ) : !event ? (
    <PageTransition><EmptyState title="Event not found" description="This event is unavailable or has been canceled." /></PageTransition>
  ) : (
    <PageTransition>
      <div className="mb-5">
        <Link href="/dashboard/events" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">Events</Link>
        <div className="mt-2 flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">{event.title}</h1>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{event.description}</p>
      </div>

      <Card data-tour="event-details">
        <div className="grid gap-3 text-sm text-zinc-600 dark:text-zinc-300">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{formatEventTime(event.startsAt)}</div>
          <div className="flex items-center gap-2">
            {event.format === 'virtual' ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            {event.format === 'virtual' ? 'Virtual' : event.locationName || 'In person'}
          </div>
          {group ? <Link href={`/dashboard/groups/${group.slug}`} className="font-medium text-zinc-900 hover:underline dark:text-white">{group.name}</Link> : null}
        </div>
        <div className="mt-5 flex items-center gap-2" data-tour="event-detail-rsvp">
          <button
            onClick={toggleRsvp}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${event.isAttending ? 'border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200' : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'}`}
          >
            {event.isAttending ? 'Cancel RSVP' : 'RSVP'}
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{event.attendeeCount}{event.capacity ? `/${event.capacity}` : ''} attending</span>
        </div>
      </Card>
    </PageTransition>
  )

  return (
    <FeatureGuard
      feature="Events"
      description="Workshops, check-ins, and live sessions with your coach. Coming soon."
      icon={<CalendarDays className="h-10 w-10" />}
    >
      {content}
    </FeatureGuard>
  )
}
