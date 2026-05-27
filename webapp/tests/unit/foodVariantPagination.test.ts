// Run with: npx tsx --test tests/unit/foodVariantPagination.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  paginateVariants,
  VARIANTS_PAGE_SIZE,
  type VariantLike,
} from '../../lib/foodVariantPagination'

function makeVariants(n: number, prefix = 'Variant'): VariantLike[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    externalId: String(1_000_000 + i),
    externalDataType: i % 2 === 0 ? 'Foundation' : 'Branded',
  }))
}

// --- Empty + default boundary -----------------------------------------------

test('empty variants array yields 1 page, no visible rows, no prev/next', () => {
  const p = paginateVariants([])
  assert.equal(p.visible.length, 0)
  assert.equal(p.visibleIndices.length, 0)
  assert.equal(p.filteredTotal, 0)
  assert.equal(p.totalPages, 1)
  assert.equal(p.page, 0)
  assert.equal(p.hasPrev, false)
  assert.equal(p.hasNext, false)
})

test('exactly 20 variants → 1 page, no next page', () => {
  const p = paginateVariants(makeVariants(VARIANTS_PAGE_SIZE))
  assert.equal(p.visible.length, 20)
  assert.equal(p.totalPages, 1)
  assert.equal(p.hasNext, false)
})

// --- Pagination behavior ----------------------------------------------------

test('60 variants → 3 pages of 20; initial render shows page 0 (variants 1-20)', () => {
  const variants = makeVariants(60)
  const p = paginateVariants(variants)
  assert.equal(p.visible.length, 20, 'page 0 shows exactly 20')
  assert.equal(p.totalPages, 3)
  assert.equal(p.page, 0)
  assert.equal(p.hasPrev, false)
  assert.equal(p.hasNext, true)
  assert.equal(p.visible[0].name, 'Variant 1')
  assert.equal(p.visible[19].name, 'Variant 20')
  assert.deepEqual(p.visibleIndices, Array.from({ length: 20 }, (_, i) => i))
})

test('60 variants → page 1 shows variants 21-40', () => {
  const variants = makeVariants(60)
  const p = paginateVariants(variants, { page: 1 })
  assert.equal(p.visible.length, 20)
  assert.equal(p.visible[0].name, 'Variant 21')
  assert.equal(p.visible[19].name, 'Variant 40')
  assert.equal(p.hasPrev, true)
  assert.equal(p.hasNext, true)
})

test('60 variants → page 2 (last page) shows variants 41-60', () => {
  const variants = makeVariants(60)
  const p = paginateVariants(variants, { page: 2 })
  assert.equal(p.visible.length, 20)
  assert.equal(p.visible[0].name, 'Variant 41')
  assert.equal(p.visible[19].name, 'Variant 60')
  assert.equal(p.hasPrev, true)
  assert.equal(p.hasNext, false)
})

test('Out-of-range page index is clamped to last valid page', () => {
  const variants = makeVariants(60)
  const p = paginateVariants(variants, { page: 99 })
  assert.equal(p.page, 2, 'clamped to totalPages-1')
  assert.equal(p.hasNext, false)
})

test('Negative page index is clamped to 0', () => {
  const variants = makeVariants(60)
  const p = paginateVariants(variants, { page: -5 })
  assert.equal(p.page, 0)
  assert.equal(p.hasPrev, false)
})

test('Trailing partial page: 25 variants → 2 pages, page 1 has 5 rows', () => {
  const variants = makeVariants(25)
  const p0 = paginateVariants(variants, { page: 0 })
  const p1 = paginateVariants(variants, { page: 1 })
  assert.equal(p0.totalPages, 2)
  assert.equal(p0.visible.length, 20)
  assert.equal(p1.visible.length, 5)
})

// --- Filter behavior --------------------------------------------------------

test('Filter narrows by name substring (case-insensitive)', () => {
  const variants: VariantLike[] = [
    { name: 'Hot Brewed', externalId: '1' },
    { name: 'Iced Bottled', externalId: '2' },
    { name: 'Hot Steeped', externalId: '3' },
  ]
  const p = paginateVariants(variants, { filter: 'hot' })
  assert.equal(p.filteredTotal, 2)
  assert.equal(p.visible.length, 2)
  assert.equal(p.visible[0].name, 'Hot Brewed')
  assert.equal(p.visible[1].name, 'Hot Steeped')
})

test('Filter matches externalId (fdcId / barcode)', () => {
  const variants = makeVariants(5)
  const p = paginateVariants(variants, { filter: '1000003' })
  assert.equal(p.filteredTotal, 1)
  assert.equal(p.visible[0].name, 'Variant 4')
})

test('Filter matches externalDataType', () => {
  const variants = makeVariants(10)
  const p = paginateVariants(variants, { filter: 'Foundation' })
  // 0,2,4,6,8 are Foundation → 5 matches
  assert.equal(p.filteredTotal, 5)
})

test('Filter pagination interaction: 100 matching variants → 5 pages of 20', () => {
  const variants = makeVariants(100, 'Greek Yogurt')
  const p = paginateVariants(variants, { filter: 'yogurt' })
  assert.equal(p.filteredTotal, 100)
  assert.equal(p.totalPages, 5)
  assert.equal(p.visible.length, 20)
})

test('Filter with no matches → empty visible, totalPages still 1', () => {
  const variants = makeVariants(60)
  const p = paginateVariants(variants, { filter: 'nonexistent-zzz' })
  assert.equal(p.filteredTotal, 0)
  assert.equal(p.visible.length, 0)
  assert.equal(p.totalPages, 1)
  assert.equal(p.hasPrev, false)
  assert.equal(p.hasNext, false)
})

test('Filter preserves original indices for callback wiring', () => {
  // Filter narrows to variants 3, 5, 7 (0-indexed); visibleIndices must
  // contain those exact numbers so the page can wire onChange callbacks
  // back to the source array.
  const variants: VariantLike[] = [
    { name: 'apple' },
    { name: 'banana' },
    { name: 'apple cider' },
    { name: 'orange' },
    { name: 'apple pie' },
    { name: 'pear' },
    { name: 'apple sauce' },
  ]
  const p = paginateVariants(variants, { filter: 'apple' })
  assert.deepEqual(p.visibleIndices, [0, 2, 4, 6])
  assert.equal(p.filteredTotal, 4)
})

test('Empty / whitespace-only filter is treated as no filter', () => {
  const variants = makeVariants(30)
  const p1 = paginateVariants(variants, { filter: '' })
  const p2 = paginateVariants(variants, { filter: '   ' })
  assert.equal(p1.filteredTotal, 30)
  assert.equal(p2.filteredTotal, 30)
})

// --- Edge cases -------------------------------------------------------------

test('Custom pageSize is honored', () => {
  const variants = makeVariants(50)
  const p = paginateVariants(variants, { pageSize: 5 })
  assert.equal(p.visible.length, 5)
  assert.equal(p.totalPages, 10)
})

test('pageSize=0 or negative falls back to a sensible minimum (≥1)', () => {
  const variants = makeVariants(10)
  const p0 = paginateVariants(variants, { pageSize: 0 })
  const pNeg = paginateVariants(variants, { pageSize: -5 })
  // Min pageSize is 1, so 10 rows = 10 pages of 1 each.
  assert.equal(p0.totalPages, 10)
  assert.equal(pNeg.totalPages, 10)
  assert.equal(p0.visible.length, 1)
})

test('null/undefined name does not crash the filter', () => {
  const variants: VariantLike[] = [
    { name: null },
    { name: undefined },
    { name: 'Variant 1', externalId: 'X' },
  ]
  const p = paginateVariants(variants, { filter: 'variant' })
  assert.equal(p.filteredTotal, 1)
  assert.equal(p.visible[0].name, 'Variant 1')
})

test('Exported VARIANTS_PAGE_SIZE constant is 20', () => {
  assert.equal(VARIANTS_PAGE_SIZE, 20)
})
