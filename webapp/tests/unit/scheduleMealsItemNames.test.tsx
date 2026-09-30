// Run with: npm run test:file tests/unit/scheduleMealsItemNames.test.tsx
//
// REGRESSION — "Each item in a meal that's scheduled is just named that meal
// for some reason."
//
// A plan built by applying a saved meal (e.g. "Turkey Sandwich") carries a
// `mealName` on the PLAN, shared by every ingredient inside it. The Schedule
// Meals drawer's "By day" list (and the "Copy day" preview) built each row's
// display name as `plan.mealName ?? item.name` — so once a plan HAD a
// mealName, every single item in it rendered as that same name instead of
// its own ("Turkey Sandwich", "Turkey Sandwich", "Turkey Sandwich" instead of
// "Turkey", "Bread", "Mayo"). The fix always shows the item's own name.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { itemDisplay, ByDayTab } from '../../components/nutrition/ScheduleMealsDrawer'
import type { MealPlan } from '../../app/dashboard/timeline/planning'
import type { IMealItem } from '../../models/Meal'

function fakeItem(name: string, calories: number): IMealItem & { _id?: string } {
  return {
    name,
    servingSize: 1,
    servingUnit: 'serving',
    servings: 1,
    nutrition: { calories, protein: 0, carbs: 0, fats: 0 },
  }
}

function fakePlan(overrides: Partial<MealPlan>): MealPlan {
  return {
    _id: 'plan-1',
    plannedDate: '2026-08-20T00:00:00.000Z',
    plannedDateKey: '2026-08-20',
    tag: 'lunch',
    items: [],
    expectedNutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    status: 'active',
    ...overrides,
  }
}

test('itemDisplay() names an item after itself, never the group mealName', () => {
  // The bug lived on the CALLER (`plan.mealName ?? it.name`) — itemDisplay
  // never accepts a group name at all, which is the fix: there is no field
  // to wrongly prefer.
  const d = itemDisplay(fakeItem('Turkey', 120))
  assert.equal(d.name, 'Turkey')
  assert.equal(d.cal, 120)
})

test('itemDisplay() multiplies by servings for the displayed calories', () => {
  const d = itemDisplay({ name: 'Rice', nutrition: { calories: 100 }, servings: 2.5 })
  assert.equal(d.cal, 250)
})

test('ByDayTab: a plan built from a saved meal shows each ingredient by its own name', () => {
  const plan = fakePlan({
    mealName: 'Turkey Sandwich',
    tag: 'lunch',
    items: [fakeItem('Turkey', 120), fakeItem('Bread', 140), fakeItem('Mayo', 90)],
  })
  const plansBySlot = new Map<string, MealPlan[]>([['lunch', [plan]]])

  const html = renderToStaticMarkup(
    ByDayTab({
      dateKey: '2026-08-20',
      slotTags: ['lunch'],
      plansBySlot,
      loading: false,
      onAddFood: () => {},
      onApplyMeal: () => {},
      onDeletePlan: () => {},
    }),
  )

  // Each ingredient's own name shows up as its own row...
  assert.match(html, /Turkey</)
  assert.match(html, /Bread</)
  assert.match(html, /Mayo</)

  // ...and "Turkey Sandwich" (the plan's mealName) does not appear stamped
  // onto the item rows three times over. It legitimately appears once, as
  // the "Add" button's accessible label ("Add food to Lunch") does not
  // reference it, so any occurrence here would be the bug reappearing as an
  // item name.
  const itemNameOccurrences = html.match(/Turkey Sandwich/g) ?? []
  assert.equal(itemNameOccurrences.length, 0, 'the group mealName must not be used as any item row\'s name')
})

test('ByDayTab: items without a shared mealName are unaffected', () => {
  const plan = fakePlan({
    tag: 'snack',
    items: [fakeItem('Almonds', 160)],
  })
  const plansBySlot = new Map<string, MealPlan[]>([['snack', [plan]]])

  const html = renderToStaticMarkup(
    ByDayTab({
      dateKey: '2026-08-20',
      slotTags: ['snack'],
      plansBySlot,
      loading: false,
      onAddFood: () => {},
      onApplyMeal: () => {},
      onDeletePlan: () => {},
    }),
  )

  assert.match(html, /Almonds</)
})
