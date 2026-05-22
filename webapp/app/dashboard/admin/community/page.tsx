'use client'

import { FormEvent, useEffect, useState } from 'react'
import { CalendarDays, RefreshCw, Save, Users } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card } from '@/components/ui'
import { CommunityEvent, CommunityGroup, formatEventTime, getToken } from '@/components/community/types'

type Tab = 'groups' | 'events'

const emptyGroup = { name: '', description: '', tags: '', visibility: 'public', status: 'active' }
const emptyEvent = { title: '', description: '', startsAt: '', format: 'virtual', status: 'draft', locationName: '', virtualUrl: '', capacity: '', groupId: '' }

export default function AdminCommunityPage() {
  const [tab, setTab] = useState<Tab>('groups')
  const [groups, setGroups] = useState<CommunityGroup[]>([])
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [groupForm, setGroupForm] = useState(emptyGroup)
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [saving, setSaving] = useState(false)

  async function load() {
    const token = getToken()
    if (!token) return
    const [groupRes, eventRes] = await Promise.all([
      fetch('/api/groups?includeArchived=true', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/events?includeDrafts=true', { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if (groupRes.ok) setGroups(((await groupRes.json()) as { groups: CommunityGroup[] }).groups)
    if (eventRes.ok) setEvents(((await eventRes.json()) as { events: CommunityEvent[] }).events)
  }

  useEffect(() => {
    load()
  }, [])

  async function createGroup(e: FormEvent) {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    setSaving(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(groupForm),
      })
      if (res.ok) {
        setGroupForm(emptyGroup)
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  async function patchGroup(group: CommunityGroup, update: Record<string, unknown>) {
    const token = getToken()
    if (!token) return
    const res = await fetch(`/api/groups/${group._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) load()
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    setSaving(true)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm),
      })
      if (res.ok) {
        setEventForm(emptyEvent)
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  async function patchEvent(event: CommunityEvent, update: Record<string, unknown>) {
    const token = getToken()
    if (!token) return
    const res = await fetch(`/api/events/${event._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) load()
  }

  return (
    <PageTransition>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">Community Admin</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Create and manage groups and events.</p>
        </div>
        <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        {(['groups', 'events'] as Tab[]).map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize ${tab === item ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>{item}</button>
        ))}
      </div>

      {tab === 'groups' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            {groups.map((group) => (
              <Card key={group._id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-zinc-900 dark:text-white">{group.name}</h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{group.description}</p>
                    <p className="mt-2 text-xs text-zinc-400">{group.memberCount} members · {group.visibility} · {group.status}</p>
                  </div>
                  <Users className="h-5 w-5 shrink-0 text-zinc-400" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => patchGroup(group, { status: group.status === 'active' ? 'archived' : 'active' })} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700">
                    {group.status === 'active' ? 'Archive' : 'Activate'}
                  </button>
                  <button onClick={() => patchGroup(group, { visibility: group.visibility === 'public' ? 'private' : 'public' })} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700">
                    Make {group.visibility === 'public' ? 'private' : 'public'}
                  </button>
                </div>
              </Card>
            ))}
          </div>
          <Card as="form" onSubmit={createGroup} className="h-fit">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">New Group</h2>
            <input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Name" className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} placeholder="Description" rows={4} className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <input value={groupForm.tags} onChange={(e) => setGroupForm({ ...groupForm, tags: e.target.value })} placeholder="Tags, comma separated" className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"><Save className="h-4 w-4" />Create Group</button>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            {events.map((event) => (
              <Card key={event._id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-zinc-900 dark:text-white">{event.title}</h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatEventTime(event.startsAt)} · {event.format}</p>
                    <p className="mt-2 text-xs text-zinc-400">{event.attendeeCount}{event.capacity ? `/${event.capacity}` : ''} attending · {event.status}</p>
                  </div>
                  <CalendarDays className="h-5 w-5 shrink-0 text-zinc-400" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => patchEvent(event, { status: event.status === 'published' ? 'draft' : 'published' })} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700">
                    {event.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={() => patchEvent(event, { status: 'canceled' })} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700">Cancel</button>
                </div>
              </Card>
            ))}
          </div>
          <Card as="form" onSubmit={createEvent} className="h-fit">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">New Event</h2>
            <input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Title" className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Description" rows={3} className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <input type="datetime-local" value={eventForm.startsAt} onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })} className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <select value={eventForm.groupId} onChange={(e) => setEventForm({ ...eventForm, groupId: e.target.value })} className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">No group</option>
              {groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}
            </select>
            <input value={eventForm.locationName} onChange={(e) => setEventForm({ ...eventForm, locationName: e.target.value })} placeholder="Location or meeting label" className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"><Save className="h-4 w-4" />Create Event</button>
          </Card>
        </div>
      )}
    </PageTransition>
  )
}
