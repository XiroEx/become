// ---------------------------------------------------------------------------
// Units library — single source of truth for unit math + parsing in the
// foods/servings stack. No external deps. US units only (no UK divergence).
//
// Three families:
//   - mass     : g, oz, lb
//   - volume   : ml, fl_oz, cup, tbsp, tsp
//   - discrete : each, slice, scoop, serving
//
// Within a family, conversion is exact (`convert`).
// Across families, conversion requires a per-variant bridge declared on the
// Food variant (`gramsPerServing` / `mlPerServing`). When a bridge is missing
// we return null rather than throwing — the UI uses null to hide the option.
// ---------------------------------------------------------------------------

/** The three families of units we recognize. */
export type UnitFamily = 'mass' | 'volume' | 'discrete'

/**
 * Every unit the picker / parser / conversion math knows about.
 *
 * `'serving'` is a synthetic discrete unit meaning "one variant's
 * `servingSize × servingUnit`". It shows up only on recipe-derived foods
 * and as a render-time concept in the picker.
 */
export type Unit =
  // mass
  | 'g' | 'oz' | 'lb'
  // volume
  | 'ml' | 'fl_oz' | 'cup' | 'tbsp' | 'tsp'
  // discrete (no cross-conversion without a bridge)
  | 'each' | 'slice' | 'scoop' | 'serving'

// ---------------------------------------------------------------------------
// Conversion tables (private)
// ---------------------------------------------------------------------------

/** Grams per unit of mass. */
const GRAMS: Record<'g' | 'oz' | 'lb', number> = {
  g: 1,
  oz: 28.3495,
  lb: 453.592,
}

/** Milliliters per unit of volume. US-defined. */
const ML: Record<'ml' | 'fl_oz' | 'cup' | 'tbsp' | 'tsp', number> = {
  ml: 1,
  fl_oz: 29.5735, // US fluid ounce
  cup: 240,        // US legal cup
  tbsp: 14.7868,   // US tablespoon
  tsp: 4.92892,    // US teaspoon
}

const MASS_UNITS = new Set<Unit>(['g', 'oz', 'lb'])
const VOLUME_UNITS = new Set<Unit>(['ml', 'fl_oz', 'cup', 'tbsp', 'tsp'])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Family the unit belongs to. */
export function familyOf(u: Unit): UnitFamily {
  if (MASS_UNITS.has(u)) return 'mass'
  if (VOLUME_UNITS.has(u)) return 'volume'
  return 'discrete'
}

/**
 * Convert within a single family. Throws if the units are in different
 * families — callers needing cross-family conversion must use
 * `convertWithBridge` instead.
 *
 * Discrete units only convert to themselves (e.g. each→each); cross-discrete
 * (each→slice) throws.
 */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value
  const fa = familyOf(from)
  const fb = familyOf(to)
  if (fa !== fb) {
    throw new Error('cross-family conversion requires bridge')
  }
  if (fa === 'mass') {
    return value * GRAMS[from as 'g' | 'oz' | 'lb'] / GRAMS[to as 'g' | 'oz' | 'lb']
  }
  if (fa === 'volume') {
    return value * ML[from as keyof typeof ML] / ML[to as keyof typeof ML]
  }
  // discrete: only same-name conversion is legal (handled by `from === to` above)
  throw new Error('cross-family conversion requires bridge')
}

/**
 * Cross-family conversion using a per-variant bridge. Returns `null` when
 * the relevant bridge isn't present so the UI can hide the option rather
 * than crash.
 *
 * Same-family inputs short-circuit to `convert`.
 */
export function convertWithBridge(
  value: number,
  from: Unit,
  to: Unit,
  variant: {
    servingSize: number
    servingUnit: Unit
    gramsPerServing?: number
    mlPerServing?: number
  },
): number | null {
  if (from === to) return value
  const fa = familyOf(from)
  const fb = familyOf(to)

  if (fa === fb) {
    // Same family — use the no-bridge path.
    try {
      return convert(value, from, to)
    } catch {
      return null
    }
  }

  // Fast path: converting INTO the variant's OWN serving unit (the conversion
  // `scalingFactor` always performs — user's unit → the variant's servingUnit).
  // Resolve the source value to a number of servings via whichever bridge matches
  // the SOURCE family, then scale by servingSize. This avoids routing through the
  // other family's canonical (which needs the OTHER bridge) — the old path divided
  // a gram-bridged cup serving by ML['cup'] again, making mass→cup ~240× too small
  // (e.g. "148 g blueberries" resolved to ~0.004 cup instead of 1 cup).
  if (to === variant.servingUnit) {
    if (fa === 'mass' && variant.gramsPerServing != null && variant.gramsPerServing > 0) {
      const servings = (value * GRAMS[from as 'g' | 'oz' | 'lb']) / variant.gramsPerServing
      return servings * variant.servingSize
    }
    if (fa === 'volume' && variant.mlPerServing != null && variant.mlPerServing > 0) {
      const servings = (value * ML[from as keyof typeof ML]) / variant.mlPerServing
      return servings * variant.servingSize
    }
  }

  // Cross-family. We need a bridge that ties the variant's serving to a
  // canonical mass (gramsPerServing) or volume (mlPerServing). Strategy:
  // 1. Convert `value` (in `from`) to the canonical of its own family.
  // 2. Use the bridge to cross to the other family's canonical.
  // 3. Convert canonical → `to`.

  const grams = variant.gramsPerServing
  const ml = variant.mlPerServing
  const servingSize = variant.servingSize
  const servingFamily = familyOf(variant.servingUnit)

  // Convert `value`/`from` → canonical of `fa`.
  let valueInCanonical: number
  if (fa === 'mass') {
    valueInCanonical = value * GRAMS[from as 'g' | 'oz' | 'lb']
  } else if (fa === 'volume') {
    valueInCanonical = value * ML[from as keyof typeof ML]
  } else {
    // discrete `from`. Treat as multiples of servings if compatible.
    if (servingFamily === 'discrete' && from === variant.servingUnit) {
      // value in servings → resolve to the other family's canonical via bridge.
      if (fb === 'mass') {
        if (grams == null) return null
        const totalGrams = (value / servingSize) * grams
        return totalGrams / GRAMS[to as 'g' | 'oz' | 'lb']
      }
      if (fb === 'volume') {
        if (ml == null) return null
        const totalMl = (value / servingSize) * ml
        return totalMl / ML[to as keyof typeof ML]
      }
      return null
    }
    return null
  }

  if (fb === 'discrete') {
    if (to === variant.servingUnit && servingFamily === 'discrete') {
      // Cross from mass/volume canonical back into "servings" using bridge.
      if (fa === 'mass' && grams != null) {
        return (valueInCanonical / grams) * servingSize
      }
      if (fa === 'volume' && ml != null) {
        return (valueInCanonical / ml) * servingSize
      }
    }
    return null
  }

  // fa and fb are mass <-> volume. Need both bridges OR a bridge that aligns
  // the variant's serving family to the OTHER family.
  let canonicalOther: number | null = null

  if (fa === 'mass' && fb === 'volume') {
    if (grams != null && ml != null) {
      canonicalOther = (valueInCanonical / grams) * ml
    } else if (servingFamily === 'mass' && ml != null) {
      // variant's serving is mass, ml bridge ties servingSize→ml.
      canonicalOther = (valueInCanonical / servingSize) * ml
    } else if (servingFamily === 'volume' && grams != null) {
      // variant's serving is volume, grams bridge ties servingSize→grams.
      canonicalOther = (valueInCanonical / grams) * servingSize
    }
  } else if (fa === 'volume' && fb === 'mass') {
    if (grams != null && ml != null) {
      canonicalOther = (valueInCanonical / ml) * grams
    } else if (servingFamily === 'volume' && grams != null) {
      canonicalOther = (valueInCanonical / servingSize) * grams
    } else if (servingFamily === 'mass' && ml != null) {
      canonicalOther = (valueInCanonical / ml) * servingSize
    }
  }

  if (canonicalOther == null) return null

  if (fb === 'mass') {
    return canonicalOther / GRAMS[to as 'g' | 'oz' | 'lb']
  }
  // fb === 'volume'
  return canonicalOther / ML[to as keyof typeof ML]
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Replace raw upstream unit codes ("34 GRM", "2.5 ONZ", "8 FLZ", "MLT")
 * inside an arbitrary label with their friendly equivalents ("34 g",
 * "2.5 oz", "8 fl oz", "ml"). Matches whole-word so "GRM" inside a
 * brand name like "STORM" stays untouched. Case-preserving.
 *
 * Common USDA / supplier codes seen in the wild:
 *   GRM → g     MLT → ml    ONZ → oz    FLZ → fl oz
 *   LBR → lb    KGM → kg    TBS → tbsp  TSP → tsp
 */
export function prettifyUnitCodes(label: string): string {
  if (!label) return label
  return label.replace(
    /\b(GRM|MLT|ONZ|FLZ|LBR|KGM|TBS|TSP)\b/gi,
    (m) => {
      switch (m.toUpperCase()) {
        case 'GRM': return 'g'
        case 'MLT': return 'ml'
        case 'ONZ': return 'oz'
        case 'FLZ': return 'fl oz'
        case 'LBR': return 'lb'
        case 'KGM': return 'kg'
        case 'TBS': return 'tbsp'
        case 'TSP': return 'tsp'
        default:    return m
      }
    },
  )
}

/**
 * Human label for a unit (singular form). Discrete units are returned
 * unmodified ("each", "slice", "scoop", "serving") — pluralization is
 * handled inside `formatQuantity`.
 */
export function unitLabel(u: Unit): string {
  switch (u) {
    case 'g':       return 'g'
    case 'oz':      return 'oz'
    case 'lb':      return 'lb'
    case 'ml':      return 'ml'
    case 'fl_oz':   return 'fl oz'
    case 'cup':     return 'cup'
    case 'tbsp':    return 'tbsp'
    case 'tsp':     return 'tsp'
    case 'each':    return 'each'
    case 'slice':   return 'slice'
    case 'scoop':   return 'scoop'
    case 'serving': return 'serving'
  }
}

const FRACTION_GLYPHS: Array<[number, string]> = [
  [1 / 3, '⅓'],
  [2 / 3, '⅔'],
  [1 / 4, '¼'],
  [1 / 2, '½'],
  [3 / 4, '¾'],
]

/**
 * Pretty-print a quantity. Common fractions use unicode glyphs; otherwise
 * round to 2 decimals and trim trailing zeros. Discrete units are
 * pluralized when value !== 1 (e.g. "2 servings"); the bare "1" prints
 * without unit suffix because discrete units rarely need labeling at
 * count==1 in this app's UI.
 */
export function formatQuantity(value: number, unit: Unit): string {
  const family = familyOf(unit)
  const text = renderNumber(value)
  const isDiscrete = family === 'discrete'
  if (isDiscrete) {
    if (value === 1) return text
    return `${text} ${pluralize(unitLabel(unit), value)}`
  }
  return `${text} ${unitLabel(unit)}`
}

function renderNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (value === 0) return '0'

  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const whole = Math.trunc(abs)
  const frac = abs - whole

  const epsilon = 0.001
  for (const [target, glyph] of FRACTION_GLYPHS) {
    if (Math.abs(frac - target) < epsilon) {
      return whole === 0 ? `${sign}${glyph}` : `${sign}${whole}${glyph}`
    }
  }

  // Round to 2 decimals, trim trailing zeros.
  const rounded = Math.round(abs * 100) / 100
  const out = rounded.toString()
  return sign + out
}

function pluralize(word: string, value: number): string {
  if (value === 1 || value === -1) return word
  // English plural for our small set: just append 's'. "slice"→"slices",
  // "serving"→"servings", "each"→"eachs"… but "each" rarely surfaces with
  // count !== 1 in the UI; if it does, "each" is acceptable as-is (it's an
  // invariant noun in food labeling). Special-case it.
  if (word === 'each') return 'each'
  return `${word}s`
}

// ---------------------------------------------------------------------------
// Picker preferences
// ---------------------------------------------------------------------------

/**
 * Suggested companion unit for the picker's custom-input toggle, based on
 * the variant's native servingUnit and the user's mass preference.
 *
 *   mass servingUnit   → 'oz' if pref==='lbs' else 'g'
 *   volume servingUnit → 'fl_oz' if pref==='lbs' else 'ml'
 *   discrete           → null  (no sensible companion)
 */
export function suggestedToggleUnit(servingUnit: Unit, weightPref: 'kg' | 'lbs'): Unit | null {
  const family = familyOf(servingUnit)
  if (family === 'mass') return weightPref === 'lbs' ? 'oz' : 'g'
  if (family === 'volume') return weightPref === 'lbs' ? 'fl_oz' : 'ml'
  return null
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

const UNIT_ALIASES: Record<string, Unit> = {
  // mass
  'g': 'g', 'gram': 'g', 'grams': 'g', 'gr': 'g',
  'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
  'lb': 'lb', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb',
  // volume
  'ml': 'ml', 'milliliter': 'ml', 'milliliters': 'ml',
  'millilitre': 'ml', 'millilitres': 'ml', 'mls': 'ml',
  'floz': 'fl_oz', 'fl_oz': 'fl_oz', 'fluidounce': 'fl_oz', 'fluidounces': 'fl_oz',
  'cup': 'cup', 'cups': 'cup', 'c': 'cup', 'c.': 'cup',
  'tbsp': 'tbsp', 'tbs': 'tbsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp', 'tbl': 'tbsp',
  'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp',
  // discrete
  'each': 'each', 'ea': 'each',
  'slice': 'slice', 'slices': 'slice',
  'scoop': 'scoop', 'scoops': 'scoop',
  'serving': 'serving', 'servings': 'serving',
}

/**
 * Parse a freeform quantity string ("100g", "1 cup", "½ cup", "8 fl oz",
 * "1.5 lb", "1 1/2 cup", "1½ tbsp") into a `{ value, unit }` pair.
 *
 * Rules:
 *  - A unit token is required. Plain numbers ("100") return null because
 *    we never want to silently assume grams.
 *  - Whitespace and case are permissive. Unit identity is strict: "1 grm"
 *    returns null.
 *  - Supports decimal, ASCII fractions ("1/2"), unicode fractions ("½"),
 *    and mixed forms ("1 1/2", "1½").
 *  - Returns canonical `Unit` values ("oz", not "ounce").
 */
export function parseQuantityString(input: string): { value: number; unit: Unit } | null {
  if (!input) return null
  const s = input.trim().toLowerCase()
  if (!s) return null

  // Pull off the leading number portion (digits, decimals, fractions, glyphs)
  // then whatever's left is the unit token.
  // Try patterns in priority order.

  // Helper: try to read a single numeric token (with optional unicode-glyph suffix).
  // Returns [value, restOfString] or null.
  type Parsed = { value: number; rest: string }

  function tryRead(s: string): Parsed | null {
    // 1. Whole number followed by unicode glyph: "1½"
    const wholeGlyph = s.match(/^(\d+)([½¼¾⅓⅔⅛⅜⅝⅞])(.*)$/)
    if (wholeGlyph) {
      const w = parseInt(wholeGlyph[1], 10)
      const f = UNICODE_FRACTIONS[wholeGlyph[2]]
      return { value: w + f, rest: wholeGlyph[3] }
    }
    // 2. Bare unicode glyph: "½ cup"
    const glyphOnly = s.match(/^([½¼¾⅓⅔⅛⅜⅝⅞])(.*)$/)
    if (glyphOnly) {
      return { value: UNICODE_FRACTIONS[glyphOnly[1]], rest: glyphOnly[2] }
    }
    // 3. Mixed ascii fraction "1 1/2": leading whole + space + fraction
    const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)(.*)$/)
    if (mixed) {
      const w = parseInt(mixed[1], 10)
      const num = parseInt(mixed[2], 10)
      const den = parseInt(mixed[3], 10)
      if (den === 0) return null
      return { value: w + num / den, rest: mixed[4] }
    }
    // 4. Plain ascii fraction "1/2"
    const frac = s.match(/^(\d+)\s*\/\s*(\d+)(.*)$/)
    if (frac) {
      const num = parseInt(frac[1], 10)
      const den = parseInt(frac[2], 10)
      if (den === 0) return null
      return { value: num / den, rest: frac[3] }
    }
    // 5. Decimal or integer "1.5", "100", ".5"
    const dec = s.match(/^(\d*\.?\d+)(.*)$/)
    if (dec) {
      return { value: parseFloat(dec[1]), rest: dec[2] }
    }
    return null
  }

  const parsed = tryRead(s)
  if (!parsed) return null
  if (!Number.isFinite(parsed.value)) return null

  // Whatever's left should be the unit token (after trimming whitespace).
  let unitText = parsed.rest.trim()
  if (!unitText) return null

  // Normalize "fl oz" → "floz", strip parentheses noise.
  unitText = unitText.replace(/\s+/g, '')
  // Strip a leading dash separator like "1-cup".
  unitText = unitText.replace(/^-+/, '')

  const unit = UNIT_ALIASES[unitText]
  if (!unit) return null

  return { value: parsed.value, unit }
}
