import type { TutorialSection } from './types'

// Tracking section — the five review-your-data surfaces, each with its own
// route-triggered segment:
//   /dashboard/progress            — training log: volume, history, PRs, body weight
//   /dashboard/history             — chronological session history
//   /dashboard/timeline            — eating history (day / week / month)
//   /dashboard/insights/[metricId] — per-metric drill-in (dynamic route → RegExp match)
//   /dashboard/calendar (+settings)— workout scheduling
//
// Charts and lists are introduced as concepts via their containers (data is
// user-dependent — a fresh account has empty charts), and conditional anchors
// rely on the tour-wide `onMissingTarget: 'skip'`.
export const trackingSection: TutorialSection = {
  steps: [
    // ── /dashboard/progress ─────────────────────────────────────────────────
    {
      id: 'tracking-progress-volume',
      target: '#volume',
      title: 'Weekly volume',
      body: 'Total weight lifted per week over the last 12 weeks — the quickest read on whether your training is trending up.',
      placement: 'bottom',
    },
    {
      id: 'tracking-progress-workouts',
      target: '#workouts',
      title: 'Every workout, in detail',
      body: 'Tap any session to expand it — best set per exercise, total volume, and PR flags.',
      placement: 'bottom',
    },
    {
      id: 'tracking-progress-records',
      target: '#records',
      title: 'Personal records',
      body: 'Your best lift for every exercise. Tap one to see its full history charted.',
      placement: 'top',
    },
    {
      id: 'tracking-progress-body',
      target: '#body',
      title: 'Body weight',
      body: 'Your weight trend against your goal line — and you can log today’s weight right from the chart.',
      placement: 'top',
    },

    // ── /dashboard/history ──────────────────────────────────────────────────
    {
      id: 'tracking-history-filters',
      target: '[data-tour="history-filters"]',
      title: 'Your session history',
      body: 'Every completed session in one list. Toggle between program workouts and quick sessions.',
      placement: 'bottom',
    },
    {
      id: 'tracking-history-list',
      target: '[data-tour="history-list"]',
      title: 'Jump back in',
      body: 'Program sessions link to their program; quick sessions open a summary — or resume where you left off.',
      placement: 'bottom',
    },

    // ── /dashboard/timeline ─────────────────────────────────────────────────
    {
      id: 'tracking-timeline-views',
      target: '[data-tour="timeline-views"]',
      title: 'Day, week, or month',
      body: 'Your eating history at three zoom levels — from a single day’s timeline to a whole month grid.',
      placement: 'bottom',
    },
    {
      id: 'tracking-timeline-date-nav',
      target: '[aria-label="Pick a date"], [aria-label="Pick a week"]',
      title: 'Jump to any date',
      body: 'Tap the date for a picker, use the arrows, or swipe to page through days.',
      placement: 'bottom',
    },
    {
      id: 'tracking-timeline-plan-tools',
      target: '[data-tour="timeline-plan-tools"]',
      title: 'Plan ahead faster',
      body: 'Copy a whole day’s meals forward, or apply one meal across several days.',
      placement: 'bottom',
    },
    {
      id: 'tracking-timeline-filters',
      target: '[data-tour="timeline-filters"]',
      title: 'Filter by tag',
      body: 'Show only breakfasts, post-workout meals, or any custom tag you’ve used.',
      placement: 'bottom',
    },

    // ── /dashboard/insights/[metricId] ──────────────────────────────────────
    {
      id: 'tracking-insights-detail',
      target: '[data-testid="insights-drill-in"]',
      title: 'Metric deep-dives',
      body: 'Tapping a dashboard tile opens that metric’s own detail view. Per-metric charts and insights land here.',
    },

    // ── /dashboard/calendar ─────────────────────────────────────────────────
    {
      id: 'tracking-calendar-grid',
      target: '[data-tour="calendar-grid"]',
      title: 'Your training calendar',
      body: 'Program workouts and quick sessions, color-coded by status. Tap any day to see and manage what’s on it.',
      placement: 'bottom',
    },
    {
      id: 'tracking-calendar-views',
      target: '[data-tour="calendar-views"]',
      title: 'Month or week',
      body: 'Zoom between a full month and a single week. Today snaps you back.',
      placement: 'bottom',
    },
    {
      id: 'tracking-calendar-settings',
      target: 'a[href="/dashboard/calendar/settings"]',
      title: 'Schedule settings',
      body: 'Change which days you train — future workouts regenerate to match.',
      placement: 'bottom',
    },

    // ── /dashboard/calendar/settings ────────────────────────────────────────
    {
      id: 'tracking-calendar-settings-days',
      target: '[data-tour="calendar-settings-schedules"]',
      title: 'Your training days',
      body: 'Each enrolled program has its own schedule. Tap Edit Days to pick new training days — future workouts regenerate automatically.',
      placement: 'bottom',
    },
  ],
  segments: {
    progress: {
      steps: [
        'tracking-progress-volume',
        'tracking-progress-workouts',
        'tracking-progress-records',
        'tracking-progress-body',
      ],
      trigger: { type: 'route', match: '/dashboard/progress', delayMs: 600 },
    },
    history: {
      steps: ['tracking-history-filters', 'tracking-history-list'],
      trigger: { type: 'route', match: '/dashboard/history', delayMs: 600 },
    },
    timeline: {
      steps: [
        'tracking-timeline-views',
        'tracking-timeline-date-nav',
        'tracking-timeline-plan-tools',
        'tracking-timeline-filters',
      ],
      trigger: { type: 'route', match: '/dashboard/timeline', delayMs: 600 },
    },
    // Dynamic [metricId] route — RegExp form of TutorialTrigger.match.
    insights: {
      steps: ['tracking-insights-detail'],
      trigger: { type: 'route', match: /^\/dashboard\/insights\/[^/]+$/, delayMs: 600 },
    },
    calendar: {
      steps: ['tracking-calendar-grid', 'tracking-calendar-views', 'tracking-calendar-settings'],
      trigger: { type: 'route', match: '/dashboard/calendar', delayMs: 600 },
    },
    'calendar-settings': {
      steps: ['tracking-calendar-settings-days'],
      trigger: { type: 'route', match: '/dashboard/calendar/settings', delayMs: 600 },
    },
  },
}
