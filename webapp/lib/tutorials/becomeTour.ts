import type { TutorialDefinition } from '@redbtn/redtutorial'

// BECOME onboarding tour — built on @redbtn/redtutorial (registry.redbtn.io).
//
// Segmented on purpose: instead of one long forced walkthrough, the "home"
// segment plays the first time the user lands on the dashboard, and the
// "nutrition" segment plays the first time they open the Nutrition tab —
// contextual coaching as the user explores. Each segment runs once per
// account (progress is stored via /api/tutorial-progress); finishing both
// marks the tutorial completed. Bump `version` to re-show after big changes.
//
// v2 (2026-07-12): full-coverage rewrite — every dashboard tile, the nudge
// card, the progress chart, and the whole nutrition logging surface. Steps
// anchor to data-tour attributes (stable) or aria-labels where those already
// exist; anything layout-dependent (tiles, nudge card) is skipped gracefully
// via onMissingTarget: 'skip'. Requires @redbtn/redtutorial >= 0.1.1 (0.1.0
// never fired route triggers for the landing path with the fetch adapter —
// which is why the home segment silently never showed).
export const becomeOnboardingTour: TutorialDefinition = {
  id: 'become-onboarding',
  version: 2,
  title: 'Welcome to BECOME',
  steps: [
    // ----- home segment (dashboard) --------------------------------------
    // No target → centered modal. Always shows, even if every later anchor
    // is missing — the segment can never silently no-op again.
    {
      id: 'welcome',
      title: 'Welcome to Become',
      body: 'Your fitness journey, tracked — workouts, food, mood, and mind in one place. Here is the 60-second lay of the land.',
      nextLabel: 'Show me around',
    },
    {
      id: 'tile-streak',
      target: '[data-tour="tile-streak"]',
      title: 'Day streak',
      body: 'Log something every day to grow your streak and earn the trophy.',
      placement: 'bottom',
    },
    {
      id: 'tile-mood',
      target: '[data-tour="tile-mood"]',
      title: "Today's mood",
      body: 'Tap to log how you feel — the tile keeps a 7-day trend.',
      placement: 'bottom',
      allowInteraction: true,
    },
    {
      id: 'tile-weekly',
      target: '[data-tour="tile-weekly"]',
      title: 'This week',
      body: 'Your weekly workout goal — watch it fill as you train.',
      placement: 'bottom',
    },
    {
      id: 'tile-goal',
      target: '[data-tour="tile-goal"]',
      title: 'Goal',
      body: 'Progress toward your annual goal, as a live percentage.',
      placement: 'bottom',
    },
    {
      id: 'tile-water',
      target: '[data-tour="tile-water"]',
      title: 'Water',
      body: 'Hydration counts too — track your intake against your daily goal.',
      placement: 'bottom',
    },
    {
      id: 'nudge-card',
      target: '[data-tour="nudge-card"]',
      title: 'Smart nudges',
      body: 'Become watches your patterns and suggests the next best action — one tap and it is done.',
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
      id: 'progress-chart',
      target: '[data-tour="progress-chart"]',
      title: 'Your trends',
      body: 'Weight, BMI, and mood over time — flip between them with the tabs.',
      placement: 'top',
    },
    {
      id: 'bottom-nav',
      target: '[data-tour="bottom-nav"]',
      title: 'Getting around',
      body: 'Workout log, Mind, Home, Nutrition, and Community — everything is one tap away.',
      placement: 'top',
    },
    {
      id: 'user-menu',
      target: 'button[aria-label="User menu"]',
      title: 'Profile & settings',
      body: 'Your profile, goals, and app settings live up here. That is the tour — go move!',
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
      id: 'nutrition-search',
      target: '[data-tour="nutrition-search"]',
      title: 'Search foods',
      body: 'Search any food to log it in seconds.',
      placement: 'bottom',
    },
    {
      id: 'nutrition-upload',
      target: 'button[aria-label="Upload options"]',
      title: 'Upload or describe',
      body: 'Already have a photo? Upload it — or just describe the meal in words.',
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
      id: 'nutrition-my-stuff',
      target: '[data-tour="nutrition-my-stuff"]',
      title: 'My Stuff',
      body: 'Saved foods, recipes, and meal plans — your shortcuts live here.',
      placement: 'bottom',
    },
    {
      id: 'calorie-ring',
      target: 'button[aria-label="Edit calorie goals"]',
      title: 'Calories remaining',
      body: 'Goal minus food = what is left today. Tap the ring to edit your goals.',
      placement: 'bottom',
      allowInteraction: true,
    },
    {
      id: 'macro-rows',
      target: '[data-tour="macro-rows"]',
      title: 'Macros',
      body: 'Protein, carbs, and fats against your targets — balance beats guesswork.',
      placement: 'top',
    },
    {
      id: 'nutrition-add',
      target: '[aria-label="Add food"], [aria-label="Schedule food"]',
      title: 'Quick add',
      body: 'This button follows you everywhere on this page — the fastest way to log. Enjoy!',
      placement: 'top',
    },
  ],
  segments: {
    home: {
      steps: [
        'welcome',
        'tile-streak',
        'tile-mood',
        'tile-weekly',
        'tile-goal',
        'tile-water',
        'nudge-card',
        'customize',
        'progress-chart',
        'bottom-nav',
        'user-menu',
      ],
      trigger: { type: 'route', match: '/dashboard', delayMs: 800 },
    },
    nutrition: {
      steps: [
        'nutrition-camera',
        'nutrition-search',
        'nutrition-upload',
        'nutrition-timeline',
        'nutrition-my-stuff',
        'calorie-ring',
        'macro-rows',
        'nutrition-add',
      ],
      trigger: { type: 'route', match: '/dashboard/nutrition', delayMs: 600 },
    },
  },
  // If a tile/button is not on screen (customized layout, no nudge right now,
  // feature-gated), skip that step rather than stalling the tour.
  onMissingTarget: 'skip',
  canSkip: true,
  skipLabel: 'Skip tour',
  doneLabel: 'Got it',
}

export const becomeTutorials: TutorialDefinition[] = [becomeOnboardingTour]
