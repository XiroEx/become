import type { TutorialSection } from './types'

// Core / dashboard section — plays on first landing at /dashboard.
//
// IMPORTANT: the dashboard tiles are user-CUSTOMIZABLE (add / remove / resize /
// reorder via Customize). So we deliberately do NOT step through each tile —
// per-tile steps break for anyone with a custom layout and imply the tiles are
// fixed. Instead we introduce the tile grid as one concept and point at
// Customize. Then we orient the user to the nudge card, trends, bottom nav, and
// profile — the durable, always-present chrome.
export const coreSection: TutorialSection = {
  steps: [
    {
      // No target → centered modal. Always shows, so the tour can never
      // silently no-op even if every later anchor is missing.
      id: 'welcome',
      title: 'Welcome to Become',
      body: 'Your whole fitness journey in one place — workouts, food, mind, and progress. Here is the 60-second lay of the land.',
      nextLabel: 'Show me around',
    },
    {
      id: 'tiles',
      target: '[data-tour="tile-grid"]',
      title: 'Your dashboard at a glance',
      body: 'These tiles surface what matters most right now — your streak, mood, weekly workouts, goals, and hydration.',
      placement: 'bottom',
    },
    {
      id: 'customize',
      target: '[data-tour="customize-tiles"]',
      title: 'Make it yours',
      body: 'Tap Customize to add, remove, resize, or rearrange tiles so the dashboard shows exactly what you care about.',
      placement: 'top',
    },
    {
      id: 'nudge',
      target: '[data-tour="nudge-card"]',
      title: 'Smart nudges',
      body: 'Become watches your patterns and suggests the next best action — one tap and it is handled.',
      placement: 'bottom',
    },
    {
      id: 'progress-chart',
      target: '[data-tour="progress-chart"]',
      title: 'Your trends',
      body: 'Weight, BMI, and mood over time — switch between them with the tabs.',
      placement: 'top',
    },
    {
      id: 'bottom-nav',
      target: '[data-tour="bottom-nav"]',
      title: 'Getting around',
      body: 'Log, Mind, Home, Nutrition, and Community — every section of the app is one tap away down here.',
      placement: 'top',
    },
    {
      id: 'user-menu',
      target: 'button[aria-label="User menu"]',
      title: 'Profile & settings',
      body: 'Your profile, goals, and app settings live up here. That is the lay of the land — explore!',
      placement: 'bottom',
    },
  ],
  segments: {
    home: {
      steps: ['welcome', 'tiles', 'customize', 'nudge', 'progress-chart', 'bottom-nav', 'user-menu'],
      trigger: { type: 'route', match: '/dashboard', delayMs: 800 },
    },
  },
}
