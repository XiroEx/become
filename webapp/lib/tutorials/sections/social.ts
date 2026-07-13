import type { TutorialSection } from './types'

// Social section — community hub, groups (browse + detail), events (browse +
// detail), and chat. One segment per surface so the right slice plays the
// first time the user lands there.
//
// Lists (groups, events, conversations) are coached as one concept/container —
// never per item — so the steps hold up with any amount of data. The browse
// pages wrap their loading/empty/list states in a single data-tour container,
// so the anchor exists even before data arrives (or when there is none).
//
// Detail pages live on dynamic routes (/groups/[groupId], /events/[eventId]),
// so their segments trigger on a RegExp route match — one representative
// segment per detail type; it plays on whichever group/event the user opens
// first. Note: the chat MESSAGE view is feature-gated (admin-only for now), so
// chat only coaches the always-available conversation list.
export const socialSection: TutorialSection = {
  steps: [
    // ── /dashboard/community — the hub ──────────────────────────────────────
    {
      id: 'social-community-hub',
      target: '[data-tour="community-tiles"]',
      title: 'Your community, three ways',
      body: 'Events, Groups, and Chats — everything social lives behind these three tiles.',
      placement: 'bottom',
    },
    {
      id: 'social-community-events',
      target: '[data-tour="community-events"]',
      title: 'Coming up',
      body: 'The next few events at a glance — tap one for details and to RSVP.',
      placement: 'top',
    },
    {
      id: 'social-community-groups',
      target: '[data-tour="community-groups"]',
      title: 'Active groups',
      body: 'A quick look at community groups — open one to see its members and events.',
      placement: 'top',
    },
    // ── /dashboard/groups — browse & join ───────────────────────────────────
    {
      id: 'social-groups-browse',
      target: '[data-tour="groups-list"]',
      title: 'Find your people',
      body: 'Each group is a focused space — a goal, a program, or an accountability crew. Tags tell you what it is about.',
      placement: 'bottom',
    },
    {
      // Anchors to the first group card's Join button — skipped when there are
      // no groups yet (the browse step still explains the page).
      id: 'social-groups-join',
      target: '[data-tour="group-join"]',
      title: 'Join in one tap',
      body: 'Join makes you a member — leave anytime. Open takes you to the group page and its events.',
      placement: 'bottom',
    },
    // ── /dashboard/groups/[groupId] — group detail ──────────────────────────
    {
      id: 'social-group-membership',
      target: '[data-tour="group-membership"]',
      title: 'Membership',
      body: 'Join or leave this group here — the member count shows who is in it with you.',
      placement: 'bottom',
    },
    {
      id: 'social-group-events',
      target: '[data-tour="group-events"]',
      title: 'Group events',
      body: 'Sessions and meetups hosted by this group land here — tap one to RSVP.',
      placement: 'top',
    },
    // ── /dashboard/events — browse & RSVP ───────────────────────────────────
    {
      id: 'social-events-browse',
      target: '[data-tour="events-list"]',
      title: 'Live sessions & workshops',
      body: 'Every event shows its time and format — virtual, in person, or hybrid.',
      placement: 'bottom',
    },
    {
      // First event card's RSVP button — skipped when no events are published.
      id: 'social-events-rsvp',
      target: '[data-tour="event-rsvp"]',
      title: 'Reserve your spot',
      body: 'Tap RSVP to claim a place — the attending count and capacity update as people sign up.',
      placement: 'bottom',
    },
    // ── /dashboard/events/[eventId] — event detail ──────────────────────────
    {
      id: 'social-event-details',
      target: '[data-tour="event-details"]',
      title: 'The full rundown',
      body: 'Time, place or video link, and the hosting group — everything you need in one card.',
      placement: 'bottom',
    },
    {
      id: 'social-event-rsvp',
      target: '[data-tour="event-detail-rsvp"]',
      title: 'You in?',
      body: 'RSVP right here — and cancel anytime if plans change.',
      placement: 'top',
    },
    // ── /dashboard/chat — conversation list ─────────────────────────────────
    {
      id: 'social-chat-conversations',
      target: '[data-tour="chat-conversations"]',
      title: 'Direct messages',
      body: 'Private conversations with your coach and community — unread badges show what is new.',
      placement: 'bottom',
    },
  ],
  segments: {
    community: {
      steps: ['social-community-hub', 'social-community-events', 'social-community-groups'],
      trigger: { type: 'route', match: '/dashboard/community', delayMs: 600 },
    },
    groups: {
      steps: ['social-groups-browse', 'social-groups-join'],
      // Exact-string match — does NOT fire on /dashboard/groups/<id> (the
      // engine's string matching is exact; groupDetail below owns that route).
      trigger: { type: 'route', match: '/dashboard/groups', delayMs: 600 },
    },
    groupDetail: {
      steps: ['social-group-membership', 'social-group-events'],
      // RegExp — any /dashboard/groups/<slug> detail page (single segment).
      trigger: { type: 'route', match: /^\/dashboard\/groups\/[^/]+\/?$/, delayMs: 600 },
    },
    events: {
      steps: ['social-events-browse', 'social-events-rsvp'],
      trigger: { type: 'route', match: '/dashboard/events', delayMs: 600 },
    },
    eventDetail: {
      steps: ['social-event-details', 'social-event-rsvp'],
      // RegExp — any /dashboard/events/<slug> detail page (single segment).
      trigger: { type: 'route', match: /^\/dashboard\/events\/[^/]+\/?$/, delayMs: 600 },
    },
    chat: {
      steps: ['social-chat-conversations'],
      trigger: { type: 'route', match: '/dashboard/chat', delayMs: 600 },
    },
  },
}
