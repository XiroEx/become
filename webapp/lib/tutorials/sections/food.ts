import type { TutorialSection } from './types'

// Food section — meals, recipes, meal plan, and the nutrition sub-routes
// (goals / scans). The main /dashboard/nutrition page has its own section
// (nutrition.ts); this covers everything one level deeper:
//
//   /dashboard/meals            — "My Stuff" library (Recipes | Meals | Foods)
//   /dashboard/meals/new        — the meal builder (MealForm; edit reuses it)
//   /dashboard/meals/[id]       — meal detail (representative detail segment)
//   /dashboard/recipes/[id]     — recipe detail (representative detail segment)
//   /dashboard/meal-plan        — weekly planner + grocery list
//   /dashboard/nutrition/goals  — calorie / macro targets
//   /dashboard/nutrition/scans  — saved AI estimate history
//
// Not covered on purpose: /dashboard/nutrition/recipes is a legacy redirect to
// /dashboard/meals; /dashboard/recipes/new + [id]/edit are thin RecipeForm
// wrappers (the meal builder is the representative builder); /meals/[id]/edit
// reuses MealForm, so the builder steps cover it.
//
// Detail routes use the library's RegExp route-match form. Ids are Mongo
// ObjectIds (24 hex chars), which also keeps /meals/new out of the detail
// segment. Lists are introduced as concepts (tabs / containers), never
// per-item. Owner-only and data-dependent anchors rely on the tour's
// onMissingTarget: 'skip'.
export const foodSection: TutorialSection = {
  steps: [
    // ── /dashboard/meals — "My Stuff" library ────────────────────────────────
    {
      // Centered modal so this segment can never silently no-op (the lists
      // below are empty for a brand-new user).
      id: 'food-my-stuff',
      title: 'My Stuff',
      body: 'Your food library — reusable meals, recipes, and single foods, all in one place.',
    },
    {
      id: 'food-tabs',
      target: '[data-tour="food-tabs"]',
      title: 'Three kinds of saved food',
      body: 'Meals are groups of foods you log in one tap. Recipes add cooking instructions and become a food. Foods are single items.',
      placement: 'bottom',
    },
    {
      id: 'food-search',
      target: '[data-tour="food-search"]',
      title: 'Find it fast',
      body: 'Search whichever tab you are on — your meals, recipes, or foods.',
      placement: 'bottom',
    },
    {
      id: 'food-new-meal',
      target: '[aria-label="Create new meal"]',
      title: 'Build a meal',
      body: 'Bundle foods you eat together into a reusable meal — then log the whole thing in one tap.',
      placement: 'top',
    },

    // ── /dashboard/meals/new — the meal builder ──────────────────────────────
    {
      id: 'food-meal-name',
      target: '#meal-name',
      title: 'Name it',
      body: 'Give the meal a name you will recognize at log time.',
      placement: 'bottom',
    },
    {
      id: 'food-meal-default-time',
      target: '[data-tour="meal-default-time"]',
      title: 'Default meal time',
      body: 'Pre-select the slot this meal usually fills — you can still log it to any meal time.',
      placement: 'top',
    },
    {
      id: 'food-meal-add-item',
      target: '[data-tour="meal-add-item"]',
      title: 'Add foods',
      body: 'Search and add each food — calories and macros total up automatically.',
      placement: 'top',
    },
    {
      id: 'food-meal-save',
      target: '[data-tour="meal-save"]',
      title: 'Save it',
      body: 'Once saved, the whole meal logs in one tap from Nutrition or the meal plan.',
      placement: 'top',
    },

    // ── /dashboard/meals/[id] — meal detail ──────────────────────────────────
    {
      id: 'food-meal-macros',
      target: '[data-tour="meal-macros"]',
      title: 'The whole meal at a glance',
      body: 'Total calories, protein, carbs, and fats across every food in the meal.',
      placement: 'bottom',
    },
    {
      // Owner-only actions row — skipped when viewing someone else's meal.
      id: 'food-meal-actions',
      target: '[data-tour="meal-actions"]',
      title: 'Edit or convert',
      body: 'Edit the foods, or convert to a recipe when you want cooking instructions and per-serving nutrition.',
      placement: 'bottom',
    },
    {
      id: 'food-meal-apply',
      target: '[data-tour="meal-apply"]',
      title: 'Log it',
      body: 'Apply the meal to your day — pick the portion, meal time, and when you ate it.',
      placement: 'top',
    },

    // ── /dashboard/recipes/[id] — recipe detail ──────────────────────────────
    {
      id: 'food-recipe-per-serving',
      target: '[data-tour="recipe-per-serving"]',
      title: 'Per-serving nutrition',
      body: 'Recipe macros are per serving, computed from the ingredients and serving count.',
      placement: 'bottom',
    },
    {
      // Only present when the recipe has instructions — skipped otherwise.
      id: 'food-recipe-instructions',
      target: '[data-tour="recipe-instructions"]',
      title: 'Cooking instructions',
      body: 'Recipes keep step-by-step instructions — meals do not.',
      placement: 'top',
    },
    {
      id: 'food-recipe-save-cta',
      target: '[data-tour="recipe-save-food"]',
      title: 'Save, then log',
      body: 'Recipes are never logged directly: the first tap saves it as a food, then you log that food anywhere.',
      placement: 'top',
    },

    // ── /dashboard/meal-plan — weekly planner ────────────────────────────────
    {
      id: 'food-plan-week',
      target: '[data-tour="plan-week-nav"]',
      title: 'Plan your week',
      body: 'Use the arrows to move between weeks; tap the dates to jump back to this week.',
      placement: 'bottom',
    },
    {
      id: 'food-plan-days',
      target: '[data-tour="plan-days"]',
      title: 'Slots for every day',
      body: 'Tap + on any slot to plan a food or meal into it. "Add meal" reveals more slots for that day.',
      placement: 'top',
    },
    {
      id: 'food-plan-grocery',
      target: '[data-tour="plan-grocery"]',
      title: 'Grocery list',
      body: 'Everything planned this week, aggregated into one checkable shopping list.',
      placement: 'bottom',
    },

    // ── /dashboard/nutrition/goals — calorie / macro targets ─────────────────
    {
      id: 'food-goals-type',
      target: '[data-tour="goals-type"]',
      title: 'Pick your goal',
      body: 'Lose, maintain, or gain — your calorie target adjusts automatically from your TDEE.',
      placement: 'bottom',
    },
    {
      id: 'food-goals-macros',
      target: '[data-tour="goals-macros"]',
      title: 'Daily targets',
      body: 'Tune calories and macro grams by hand, or let a preset split do the math.',
      placement: 'top',
    },
    {
      id: 'food-goals-save',
      target: '[data-tour="goals-save"]',
      title: 'Save your targets',
      body: 'The Nutrition calorie ring and macro bars track against these numbers.',
      placement: 'top',
    },

    // ── /dashboard/nutrition/scans — AI estimate history ─────────────────────
    {
      // Centered modal — a new user has no scans yet, so the anchored step
      // below may skip; this guarantees the segment still shows something.
      id: 'food-scans-intro',
      title: 'Estimate history',
      body: 'Every photo and describe estimate is saved here automatically.',
    },
    {
      id: 'food-scans-actions',
      target: '[data-tour="scans-list"]',
      title: 'Reuse an estimate',
      body: 'Log an estimate again for today, edit and re-log it, or delete it.',
      placement: 'bottom',
    },
  ],
  segments: {
    'food-meals': {
      steps: ['food-my-stuff', 'food-tabs', 'food-search', 'food-new-meal'],
      trigger: { type: 'route', match: '/dashboard/meals', delayMs: 600 },
    },
    'food-meal-builder': {
      steps: ['food-meal-name', 'food-meal-default-time', 'food-meal-add-item', 'food-meal-save'],
      trigger: { type: 'route', match: '/dashboard/meals/new', delayMs: 600 },
    },
    'food-meal-detail': {
      steps: ['food-meal-macros', 'food-meal-actions', 'food-meal-apply'],
      trigger: { type: 'route', match: /^\/dashboard\/meals\/[0-9a-f]{24}$/i, delayMs: 600 },
    },
    'food-recipe-detail': {
      steps: ['food-recipe-per-serving', 'food-recipe-instructions', 'food-recipe-save-cta'],
      trigger: { type: 'route', match: /^\/dashboard\/recipes\/[0-9a-f]{24}$/i, delayMs: 600 },
    },
    'food-meal-plan': {
      steps: ['food-plan-week', 'food-plan-days', 'food-plan-grocery'],
      trigger: { type: 'route', match: '/dashboard/meal-plan', delayMs: 600 },
    },
    'food-goals': {
      steps: ['food-goals-type', 'food-goals-macros', 'food-goals-save'],
      trigger: { type: 'route', match: '/dashboard/nutrition/goals', delayMs: 600 },
    },
    'food-scans': {
      steps: ['food-scans-intro', 'food-scans-actions'],
      trigger: { type: 'route', match: '/dashboard/nutrition/scans', delayMs: 600 },
    },
  },
}
