import type { TutorialSection } from './types'

// Nutrition section — plays on first open of /dashboard/nutrition. Covers the
// full logging surface: camera / search / upload capture, the timeline and My
// Stuff shortcuts, the calorie ring, macros, and the quick-add FAB.
// (Sub-routes like /nutrition/goals, /recipes, /scans get their own sections.)
export const nutritionSection: TutorialSection = {
  steps: [
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
      body: 'This button follows you everywhere on this page — the fastest way to log.',
      placement: 'top',
    },
  ],
  segments: {
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
}
