// Run with: npm run test:file tests/unit/editFoodModalTagSave.test.tsx
//
// REGRESSION — "Changing tags doesn't offer the ability to save for logged
// foods."
//
// EditFoodModal's Save button was gated on `selection`, a QuantityPicker
// `onChange` value. That value only ever arrives via an effect — and
// QuantityPicker's mount effect (child) races EditFoodModal's own
// item-change reset effect (parent): children commit their effects before
// parents, so the reset's `setSelection(null)` always ran right after the
// picker's first emission and wiped it back out. A member who opened the
// sheet and only touched the Meal Tag dropdown (never the Amount picker)
// therefore saw Save stuck disabled forever — `selection` never became
// non-null unless they also interacted with the amount picker.
//
// `renderToStaticMarkup` never runs effects at all (no jsdom/testing-library
// in this repo — see weightLogSheet.test.tsx), which makes it a clean tool
// here: on the broken code, `selection` stays exactly `null` through a static
// render, so Save renders disabled on the very first paint, before any
// interaction. The fix computes a fallback selection synchronously from the
// item's already-logged amount, so Save renders enabled immediately.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import EditFoodModal from '../../components/nutrition/EditFoodModal'
import type { IMealItem } from '../../models/Meal'

function fakeItem(overrides: Partial<IMealItem> = {}): IMealItem & { _id?: string } {
  return {
    name: 'Bone Broth Protein',
    brand: 'Nutricost',
    servingSize: 0.25,
    servingUnit: 'cup',
    servings: 1,
    nutrition: { calories: 90, protein: 20, carbs: 1, fats: 0.5 },
    loggedQuantity: 0.25,
    loggedUnit: 'cup',
    ...overrides,
  } as IMealItem & { _id?: string }
}

function submitButtonMarkup(html: string): string {
  const match = html.match(/<button type="submit"[^>]*>/)
  assert.ok(match, 'expected a submit button in the rendered markup')
  return match![0]
}

// The button's className includes the Tailwind variant `disabled:opacity-40`,
// so a bare /disabled/ match would false-positive on every render. React SSR
// only emits the boolean `disabled=""` attribute when the prop is truthy.
function isDisabled(buttonMarkup: string): boolean {
  return /\bdisabled=""/.test(buttonMarkup)
}

test('Save is enabled on open, before any amount interaction', () => {
  const html = renderToStaticMarkup(
    <EditFoodModal
      isOpen={true}
      item={fakeItem()}
      logId="log-1"
      currentTag="snack"
      availableTags={{ defaults: ['snack', 'before-work'], userTags: [] }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
  assert.equal(
    isDisabled(submitButtonMarkup(html)),
    false,
    'Save must not require touching the Amount picker before it becomes savable',
  )
})

test('Save stays enabled for an item backfilled from `servings` (no loggedQuantity/loggedUnit)', () => {
  const html = renderToStaticMarkup(
    <EditFoodModal
      isOpen={true}
      item={fakeItem({ loggedQuantity: undefined, loggedUnit: undefined, servings: 2 })}
      logId="log-1"
      currentTag="snack"
      availableTags={{ defaults: ['snack'], userTags: [] }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
  assert.equal(isDisabled(submitButtonMarkup(html)), false)
})

test('closed / no item renders nothing (sanity check on the modal gate)', () => {
  const html = renderToStaticMarkup(
    <EditFoodModal
      isOpen={false}
      item={null}
      logId="log-1"
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
  assert.equal(html.includes('type="submit"'), false)
})
