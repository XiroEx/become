import type { TutorialDefinition } from '@/lib/redtutorial'

// BECOME onboarding tour — built on @redbtn/redtutorial (vendored at
// lib/redtutorial until the package is published).
//
// Segmented on purpose: instead of one long forced walkthrough, the "home"
// segment plays the first time the user lands on the dashboard, and the
// "nutrition" segment plays the first time they open the Nutrition tab —
// contextual coaching as the user explores. Each segment runs once per
// account (progress is stored via /api/tutorial-progress); finishing both
// marks the tutorial completed. Bump `version` to re-show after big changes.
export const becomeOnboardingTour: TutorialDefinition = {
  id: 'become-onboarding',
  version: 1,
  title: 'Welcome to BECOME',
  steps: [
    // ----- home segment -------------------------------------------------
    {
      id: 'welcome',
      title: 'Welcome to BECOME',
      body: 'Transform your body and mind. Here is a 30-second tour of where everything lives — you can skip anytime.',
      nextLabel: 'Show me around',
    },
    {
      id: 'tiles',
      target: '[data-tour="dashboard-tiles"]',
      title: 'Your day at a glance',
      body: 'Streak, workouts, mood, macros — these tiles update live as you log.',
      placement: 'bottom',
    },
    {
      id: 'customize',
      target: '[data-tour="customize-tiles"]',
      title: 'Make it yours',
      body: 'Reorder, resize, or swap tiles so the dashboard shows what you care about.',
      placement: 'top',
    },
    {
      id: 'nav-workout',
      target: 'nav[aria-label="Primary"] a[aria-label="Workout"]',
      title: 'Train',
      body: 'Your programs and workout sessions live here. Tap it to start training.',
      placement: 'top',
      allowInteraction: true,
    },
    {
      id: 'nav-nutrition',
      target: 'nav[aria-label="Primary"] a[aria-label="Nutrition"]',
      title: 'Eat',
      body: 'Log meals, scan barcodes, and track macros and water. We will show you the details the first time you open it.',
      placement: 'top',
    },
    {
      id: 'nav-mind',
      target: 'nav[aria-label="Primary"] a[aria-label="Mind"]',
      title: 'Mind',
      body: 'Guided sessions, journaling, and daily non-negotiables to keep your head in the game.',
      placement: 'top',
    },
    {
      id: 'nav-community',
      target: 'nav[aria-label="Primary"] a[aria-label="Community"]',
      title: 'Community',
      body: 'Groups, events, and chat — train with people who push you.',
      placement: 'top',
    },
    {
      id: 'user-menu',
      target: 'button[aria-label="User menu"]',
      title: 'Profile & settings',
      body: 'Your profile, goals, and app settings are up here. That is the lay of the land — go move!',
      placement: 'bottom',
    },

    // ----- nutrition segment (contextual) --------------------------------
    {
      id: 'nutrition-camera',
      target: 'button[aria-label="Camera options"]',
      title: 'Log food with your camera',
      body: 'Snap a photo of your plate or scan a barcode — the AI estimates the macros for you.',
      placement: 'bottom',
    },
    {
      id: 'nutrition-timeline',
      target: 'button[aria-label="Timeline and history"]',
      title: 'Your day as a timeline',
      body: 'Review everything you have logged today, plus past AI estimates.',
      placement: 'bottom',
    },
    {
      id: 'nutrition-add',
      target: '[aria-label="Add food"], [aria-label="Schedule food"]',
      title: 'Quick add',
      body: 'The fastest way to log: search any food or add your own. Enjoy!',
      placement: 'top',
    },
  ],
  segments: {
    home: {
      steps: [
        'welcome',
        'tiles',
        'customize',
        'nav-workout',
        'nav-nutrition',
        'nav-mind',
        'nav-community',
        'user-menu',
      ],
      trigger: { type: 'route', match: '/dashboard', delayMs: 800 },
    },
    nutrition: {
      steps: ['nutrition-camera', 'nutrition-timeline', 'nutrition-add'],
      trigger: { type: 'route', match: '/dashboard/nutrition', delayMs: 600 },
    },
  },
  // If a tile/button is not on screen (e.g. feature-gated), skip that step
  // rather than stalling the tour.
  onMissingTarget: 'skip',
  canSkip: true,
  skipLabel: 'Skip tour',
  doneLabel: 'Got it',
}

export const becomeTutorials: TutorialDefinition[] = [becomeOnboardingTour]
