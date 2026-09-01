// Run with: npx tsx --test tests/unit/exerciseVariationLinks.test.ts
//
// Covers the pure helpers used by scripts/link-exercise-variations.ts:
//   - computeVariationLinkDiff (idempotency: re-applying a fix that already
//     matches is a no-op; additive: never drops an existing variation link)
//   - formatVariationLinkDiff (shape of the human-readable line)
//
// Plus allow-list integrity checks on VARIATION_LINK_FIXES and
// NEW_VARIATION_EXERCISES — catches typos in cross-referenced slugs before
// they ever reach a database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeVariationLinkDiff,
  formatVariationLinkDiff,
  VARIATION_LINK_FIXES,
  NEW_VARIATION_EXERCISES,
  type VariationLinkFix,
} from '../../lib/exerciseVariationLinks'

const sampleFix: VariationLinkFix = {
  slug: 'close-grip-dumbbell-press',
  reason: 'narrow-grip press variant',
  addVariations: ['dumbbell-bench-press', 'barbell-bench-press'],
}

// ── computeVariationLinkDiff ─────────────────────────────────────────────────

test('computeVariationLinkDiff: missing links → changed=true, appends without dropping existing', () => {
  const diff = computeVariationLinkDiff(
    { variations: ['incline-close-grip-dumbbell-press'], aliases: [] },
    sampleFix,
  )
  assert.equal(diff.changed, true)
  assert.equal(diff.variationsChanged, true)
  assert.deepEqual(diff.nextVariations, [
    'incline-close-grip-dumbbell-press',
    'dumbbell-bench-press',
    'barbell-bench-press',
  ])
})

test('computeVariationLinkDiff: already has all links → changed=false (idempotency)', () => {
  const diff = computeVariationLinkDiff(
    { variations: ['dumbbell-bench-press', 'barbell-bench-press', 'other-slug'], aliases: [] },
    sampleFix,
  )
  assert.equal(diff.changed, false)
  assert.equal(diff.variationsChanged, false)
  assert.deepEqual(diff.nextVariations, ['dumbbell-bench-press', 'barbell-bench-press', 'other-slug'])
})

test('computeVariationLinkDiff: partial overlap → only appends the missing slug', () => {
  const diff = computeVariationLinkDiff(
    { variations: ['dumbbell-bench-press'], aliases: [] },
    sampleFix,
  )
  assert.equal(diff.changed, true)
  assert.deepEqual(diff.nextVariations, ['dumbbell-bench-press', 'barbell-bench-press'])
})

test('computeVariationLinkDiff: removeAliases drops the matching alias, keeps the rest', () => {
  const fix: VariationLinkFix = {
    slug: 'lat-pulldown',
    reason: 'grip variant graduated to its own exercise',
    addVariations: ['close-grip-lat-pulldown'],
    removeAliases: ['Close Grip Lat Pulldown'],
  }
  const diff = computeVariationLinkDiff(
    { variations: [], aliases: ['Lat Pulldowns', 'Close Grip Lat Pulldown'] },
    fix,
  )
  assert.equal(diff.changed, true)
  assert.equal(diff.aliasesChanged, true)
  assert.deepEqual(diff.nextAliases, ['Lat Pulldowns'])
})

test('computeVariationLinkDiff: removeAliases already absent → aliasesChanged=false', () => {
  const fix: VariationLinkFix = {
    slug: 'lat-pulldown',
    reason: 'grip variant graduated to its own exercise',
    addVariations: [],
    removeAliases: ['Close Grip Lat Pulldown'],
  }
  const diff = computeVariationLinkDiff(
    { variations: ['x'], aliases: ['Lat Pulldowns'] },
    fix,
  )
  assert.equal(diff.aliasesChanged, false)
  assert.deepEqual(diff.nextAliases, ['Lat Pulldowns'])
})

test('computeVariationLinkDiff: no removeAliases specified → aliases untouched', () => {
  const diff = computeVariationLinkDiff(
    { variations: [], aliases: ['Some Alias'] },
    sampleFix,
  )
  assert.equal(diff.aliasesChanged, false)
  assert.deepEqual(diff.nextAliases, ['Some Alias'])
})

test('idempotency: applying the diff and recomputing shows no further change', () => {
  let current = { variations: ['other-slug'], aliases: [] as string[] }

  const first = computeVariationLinkDiff(current, sampleFix)
  assert.equal(first.changed, true)

  // Apply (script: ex.variations = diff.nextVariations)
  current = { variations: first.nextVariations, aliases: first.nextAliases }

  const second = computeVariationLinkDiff(current, sampleFix)
  assert.equal(second.changed, false)
})

// ── formatVariationLinkDiff ──────────────────────────────────────────────────

test('formatVariationLinkDiff: unchanged → single-line ✓ notice', () => {
  const diff = computeVariationLinkDiff(
    { variations: ['dumbbell-bench-press', 'barbell-bench-press'], aliases: [] },
    sampleFix,
  )
  const out = formatVariationLinkDiff(diff)
  assert.ok(out.startsWith('✓ close-grip-dumbbell-press'))
  assert.equal(out.split('\n').length, 1)
})

test('formatVariationLinkDiff: changed → header + one line per changed field', () => {
  const diff = computeVariationLinkDiff({ variations: [], aliases: [] }, sampleFix)
  const out = formatVariationLinkDiff(diff)
  const lines = out.split('\n')
  assert.ok(lines[0].startsWith('✎ close-grip-dumbbell-press'))
  assert.ok(lines[0].includes('narrow-grip press variant'))
  assert.equal(lines.length, 2)
  assert.ok(lines[1].includes('variations:'))
})

// ── VARIATION_LINK_FIXES allow-list integrity ────────────────────────────────

test('VARIATION_LINK_FIXES: non-empty', () => {
  assert.ok(VARIATION_LINK_FIXES.length > 0)
})

test('VARIATION_LINK_FIXES: every fix has a non-empty reason and at least one effect', () => {
  for (const f of VARIATION_LINK_FIXES) {
    assert.ok(f.reason && f.reason.length > 0, `fix for ${f.slug} missing reason`)
    const hasEffect = f.addVariations.length > 0 || (f.removeAliases?.length ?? 0) > 0
    assert.ok(hasEffect, `fix for ${f.slug} has no addVariations and no removeAliases — no-op entry`)
  }
})

test('VARIATION_LINK_FIXES: no fix lists itself as one of its own variations', () => {
  for (const f of VARIATION_LINK_FIXES) {
    assert.ok(!f.addVariations.includes(f.slug), `${f.slug} lists itself as a variation`)
  }
})

test('VARIATION_LINK_FIXES: every referenced slug is either a known existing exercise or a NEW_VARIATION_EXERCISES slug', () => {
  // Slugs confirmed present in production as of the 2026-08-25 catalog pull —
  // this is a typo guard, not a live DB check.
  const KNOWN_EXISTING_SLUGS = new Set([
    'close-grip-dumbbell-press', 'dumbbell-bench-press', 'barbell-bench-press',
    'incline-close-grip-dumbbell-press', 'incline-bench-press', 'incline-dumbbell-press',
    'decline-push-up', 'light-dumbbell-floor-press', 'dumbbell-floor-press',
    'machine-chest-press', 'lat-pulldown', 'dumbbell-underhand-row', 'barbell-row',
    'dumbbell-row', 'cable-row', 'tricep-dip', 'cable-tricep-pushdown',
    'overhead-tricep-extension', 'skull-crusher', 'tricep-cable-kickback', 'pull-up',
  ])
  const newSlugs = new Set(NEW_VARIATION_EXERCISES.map((e) => e.slug))
  const fixSlugs = new Set(VARIATION_LINK_FIXES.map((f) => f.slug))

  for (const f of VARIATION_LINK_FIXES) {
    assert.ok(
      KNOWN_EXISTING_SLUGS.has(f.slug) || newSlugs.has(f.slug),
      `fix targets unknown slug: ${f.slug}`,
    )
    for (const v of f.addVariations) {
      assert.ok(
        KNOWN_EXISTING_SLUGS.has(v) || newSlugs.has(v) || fixSlugs.has(v),
        `${f.slug} links to unrecognized slug: ${v}`,
      )
    }
  }
})

// ── NEW_VARIATION_EXERCISES allow-list integrity ─────────────────────────────

test('NEW_VARIATION_EXERCISES: non-empty', () => {
  assert.ok(NEW_VARIATION_EXERCISES.length > 0)
})

test('NEW_VARIATION_EXERCISES: slugs are unique', () => {
  const slugs = NEW_VARIATION_EXERCISES.map((e) => e.slug)
  const unique = new Set(slugs)
  assert.equal(unique.size, slugs.length, `duplicate slug(s): ${slugs.join(', ')}`)
})

test('NEW_VARIATION_EXERCISES: every entry has the fields required by the Exercise schema', () => {
  for (const e of NEW_VARIATION_EXERCISES) {
    assert.ok(e.slug, 'missing slug')
    assert.ok(e.name, `${e.slug} missing name`)
    assert.ok(e.category, `${e.slug} missing category`)
    assert.ok(e.role, `${e.slug} missing role`)
    assert.ok(e.trackingType, `${e.slug} missing trackingType`)
    assert.ok(e.bodyRegion, `${e.slug} missing bodyRegion`)
    assert.ok(e.movementPatterns.length > 0, `${e.slug} has no movementPatterns`)
    assert.ok(e.primaryMuscles.length > 0, `${e.slug} has no primaryMuscles`)
    assert.ok(e.equipment.length > 0, `${e.slug} has no equipment`)
    assert.equal(e.isActive, true, `${e.slug} should be isActive`)
    assert.equal(e.isCustom, false, `${e.slug} should not be isCustom (it's a universal catalog entry)`)
  }
})

test('NEW_VARIATION_EXERCISES: variations never self-reference', () => {
  for (const e of NEW_VARIATION_EXERCISES) {
    assert.ok(!e.variations.includes(e.slug), `${e.slug} lists itself as a variation`)
  }
})

test('NEW_VARIATION_EXERCISES: every variation slug resolves to a known existing or sibling new exercise', () => {
  const KNOWN_EXISTING_SLUGS = new Set([
    'machine-chest-press', 'dumbbell-bench-press', 'barbell-bench-press', 'lat-pulldown', 'pull-up',
  ])
  const newSlugs = new Set(NEW_VARIATION_EXERCISES.map((e) => e.slug))
  for (const e of NEW_VARIATION_EXERCISES) {
    for (const v of e.variations) {
      assert.ok(
        KNOWN_EXISTING_SLUGS.has(v) || newSlugs.has(v),
        `${e.slug} links to unrecognized slug: ${v}`,
      )
    }
  }
})
