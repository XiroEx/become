// ---------------------------------------------------------------------------
// foodVariantPagination — pure helpers for paginating + filtering a Food's
// variants array in the admin detail view.
//
// Why a helper: the admin detail page renders every variant in a flat list,
// which is fine at 5-12 but becomes a typing-lag nightmare past 50.
// Centralising the math here lets us unit-test the pagination boundary +
// filter behavior without spinning up a browser.
// ---------------------------------------------------------------------------

export const VARIANTS_PAGE_SIZE = 20

export interface VariantLike {
  name?: string | null
  externalId?: string | null
  externalDataType?: string | null
}

export interface PaginatedVariants<T extends VariantLike> {
  /** Variants visible on the current page (after filter + pagination). */
  visible: T[]
  /** Indices into the ORIGINAL `variants` array — preserved through the filter
   *  so onChange/onRemove callbacks still address the right row. */
  visibleIndices: number[]
  /** Total number of variants after filtering, before pagination. */
  filteredTotal: number
  /** Total number of pages (≥1 even when empty). */
  totalPages: number
  /** Clamped page index that was actually used (0-based). */
  page: number
  /** True if there is a previous page from the clamped one. */
  hasPrev: boolean
  /** True if there is a next page from the clamped one. */
  hasNext: boolean
}

/**
 * Case-insensitive substring match across the variant fields most useful
 * for narrowing a long list: variant name, externalId (USDA fdcId / OFF
 * barcode), and externalDataType (Foundation, SR Legacy, etc).
 */
function matchesFilter(v: VariantLike, q: string): boolean {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const name = (v.name ?? '').toLowerCase()
  const ext = (v.externalId ?? '').toLowerCase()
  const type = (v.externalDataType ?? '').toLowerCase()
  return name.includes(needle) || ext.includes(needle) || type.includes(needle)
}

/**
 * Apply filter + pagination to a variants list. Pure; no IO. Returns the
 * visible slice plus its original indices so the caller can wire edit /
 * remove callbacks back to the correct row in the source array.
 *
 * Defaults: filter='' (no narrowing), page=0, pageSize=VARIANTS_PAGE_SIZE.
 * Negative or out-of-range `page` is clamped to [0, totalPages-1].
 */
export function paginateVariants<T extends VariantLike>(
  variants: T[],
  options?: { filter?: string; page?: number; pageSize?: number },
): PaginatedVariants<T> {
  const pageSize = Math.max(1, options?.pageSize ?? VARIANTS_PAGE_SIZE)
  const filter = options?.filter ?? ''

  // Filter while keeping original-index mapping.
  const filteredIndices: number[] = []
  for (let i = 0; i < variants.length; i++) {
    if (matchesFilter(variants[i], filter)) filteredIndices.push(i)
  }
  const filteredTotal = filteredIndices.length

  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize))
  const rawPage = options?.page ?? 0
  const page = Math.min(Math.max(0, rawPage), totalPages - 1)

  const start = page * pageSize
  const end = Math.min(start + pageSize, filteredTotal)
  const visibleIndices = filteredIndices.slice(start, end)
  const visible = visibleIndices.map(i => variants[i])

  return {
    visible,
    visibleIndices,
    filteredTotal,
    totalPages,
    page,
    hasPrev: page > 0,
    hasNext: page < totalPages - 1,
  }
}
