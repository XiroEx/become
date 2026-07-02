// ---------------------------------------------------------------------------
// foodNameClean — Phase 1 of the food-data build audit (FOOD_DATA_BUILD_AUDIT.md).
//
// USDA descriptions lead with a food-GROUP word ("Beverages, tea, black, …") and
// are often ALL-CAPS for branded rows. An earlier prettifier also produced
// space-joined category prefixes ("Beverages Tea", "Beverages Coffee"). This
// module normalizes a raw description into a readable food NAME without changing
// its identity. It is deliberately conservative: strip a leading category word,
// de-shout ALL-CAPS, drop trailing filler. It does NOT reorder to a head noun or
// restructure variants — that's Phase 2 (needs review).
// ---------------------------------------------------------------------------

// USDA food-GROUP leading words that are NEVER a head noun — safe to strip as a
// leading segment (comma form) or leading word (space-joined form) when
// something meaningful follows. Deliberately excludes singular food words
// (beef, pork, soup, coffee, lentils, …) because USDA also uses THOSE as the
// real head noun in comma descriptions ("Beef, ground" → must NOT become
// "ground"). Only unambiguous category words live here.
const CATEGORY_LEAD = new Set([
  'beverages', 'beverage',
  'snacks',
  'fast foods', 'fast food',
  'baby foods', 'babyfood',
  'restaurant foods',
  'meals entrees and side dishes',
])

// Acronyms that must NOT be de-shouted (kept upper-case).
const ACRONYMS = new Set(['USDA', 'NFS', 'RTD', 'RTE', 'UHT', 'GTIN', 'UPC'])

// Trailing filler segments (USDA verbosity) that add no identity.
const TRAILING_FILLER = [
  /^ns as to (form|type|.*)$/i,
  /^nfs$/i,
  /^all (classes|types|grades)$/i,
  /^prepared with .*$/i,
  /^prepared$/i,
  /^unprepared$/i,
  /^ready[- ]to[- ]drink$/i,
  /^ready to (eat|feed)$/i,
  /^made with .*$/i,
  /^added .*$/i,
  /^includes .*$/i,
  /^upc:? .*$/i,
  /^gtin:? .*$/i,
]

function titleCaseToken(w: string): string {
  if (!w) return w
  // Split off leading/trailing punctuation (commas, parens) so "ARIZONA," still
  // de-shouts. De-shout any ALL-CAPS run >2 letters (brand names like "ARIZONA").
  const m = w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
  if (!m) return w
  const [, pre, core, post] = m
  if (ACRONYMS.has(core)) return w
  if (/^\p{Lu}[\p{Lu}'.&-]{2,}$/u.test(core)) {
    return pre + core.charAt(0) + core.slice(1).toLowerCase() + post
  }
  return w
}

function deShout(s: string): string {
  return s.split(/(\s+)/).map(titleCaseToken).join('')
}

function capitalizeFirst(s: string): string {
  const i = s.search(/[A-Za-z]/)
  if (i < 0) return s
  return s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1)
}

/**
 * Normalize a raw USDA/OFF description into a readable food name.
 * Conservative & identity-preserving. Returns the input trimmed if nothing to do.
 */
export function cleanFoodName(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw
  let name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return raw

  // --- Comma form: "Beverages, tea, black, ready to drink" ---
  if (name.includes(',')) {
    let segs = name.split(',').map(s => s.trim()).filter(Boolean)
    // strip ONE leading category segment
    if (segs.length > 1 && CATEGORY_LEAD.has(segs[0].toLowerCase())) segs.shift()
    // drop trailing filler
    while (segs.length > 1 && TRAILING_FILLER.some(re => re.test(segs[segs.length - 1]))) segs.pop()
    name = segs.join(', ')
  } else {
    // --- Space-joined form: "Beverages Tea", "Beverages Coffee" ---
    const words = name.split(' ')
    if (words.length > 1 && CATEGORY_LEAD.has(words[0].toLowerCase())) {
      words.shift()
      name = words.join(' ')
    }
  }

  name = capitalizeFirst(deShout(name).replace(/\s+/g, ' ').trim())
  // Never return empty — fall back to the original.
  return name || raw.trim()
}

/**
 * Reject garbled serving labels ("1 f food", "425 mt", raw "226.796 g") and
 * round numeric quantities. Returns a cleaned label, or null when the label is
 * unusable (caller should fall back to the plain unit label).
 */
export function sanitizeServingLabel(label: string | undefined | null): string | null {
  if (!label || typeof label !== 'string') return null
  let s = label.trim().replace(/\s+/g, ' ')
  if (!s) return null

  // Obvious junk tokens seen in prod FNDDS portion text.
  if (/\bf food\b/i.test(s)) return null
  // "425 mt" / "12 mt" — "mt" is not a real unit (mis-parsed "ml"/"g" text).
  if (/^\d[\d.]*\s*mt$/i.test(s)) return null
  // A bare number with no unit is not a label.
  if (/^\d[\d.]*$/.test(s)) return null

  // Round an unrounded gram/ml quantity: "226.796 g" -> "227 g".
  s = s.replace(/(\d+\.\d+)\s*(g|ml|kg|l|oz|lb|lbs)\b/gi, (_m, num: string, unit: string) => {
    const n = parseFloat(num)
    const rounded = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10
    return `${rounded} ${unit.toLowerCase()}`
  })

  return s || null
}
