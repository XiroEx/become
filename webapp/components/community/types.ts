export interface CommunityGroup {
  _id: string
  name: string
  slug: string
  description: string
  status: 'active' | 'archived'
  visibility: 'public' | 'private'
  tags?: string[]
  memberCount: number
  isMember: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CommunityEvent {
  _id: string
  title: string
  slug: string
  description: string
  status: 'draft' | 'published' | 'canceled'
  format: 'in_person' | 'virtual' | 'hybrid'
  startsAt: string
  endsAt?: string
  locationName?: string
  virtualUrl?: string
  capacity?: number
  attendeeCount: number
  isAttending: boolean
  groupId?: { _id: string; name: string; slug: string } | string
}

export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export function formatEventTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
