'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, MapPin, Video } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { CommunityEvent, formatEventTime, getToken } from '@/components/community/types'

function eventPlace(event: CommunityEvent) {
  if (event.format === 'virtual') return 'Virtual'
  if (event.format === 'hybrid') return event.locationName ? `${event.locationName} + virtual` : 'Hybrid'
  return event.locationName || 'In person'
}

export default function EventsPage() {
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json() as { events: CommunityEvent[] }
        setEvents(data.events)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleRsvp(event: CommunityEvent) {
    const token = getToken()
    if (!token) return
    const res = await fetch(`/api/events/${event.slug}/rsvp`, {
      method: event.isAttending ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) load()
  }

  return (
    <PageTransition>
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">Events</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Live sessions, workshops, and community check-ins.</p>
      </div>

      {/* data-tour wrapper: stable tour anchor across loading / empty / list states */}
      <div data-tour="events-list">
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />)}</div>
      ) : events.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No events yet" description="Published events will appear here." />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event._id}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/events/${event.slug}`} className="text-base font-semibold text-zinc-900 hover:underline dark:text-white">{event.title}</Link>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{event.description}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatEventTime(event.startsAt)}</span>
                    <span className="inline-flex items-center gap-1">{event.format === 'virtual' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{eventPlace(event)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => toggleRsvp(event)}
                  data-tour="event-rsvp"
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${event.isAttending ? 'border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200' : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'}`}
                >
                  {event.isAttending ? 'Cancel RSVP' : 'RSVP'}
                </button>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{event.attendeeCount}{event.capacity ? `/${event.capacity}` : ''} attending</span>
              </div>
            </Card>
          ))}
        </div>
      )}
      </div>
    </PageTransition>
  )
}
