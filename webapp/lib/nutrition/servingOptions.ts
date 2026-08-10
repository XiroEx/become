import {
  type Unit,
  convert,
  convertWithBridge,
  familyOf,
  formatQuantity,
  parseQuantityString,
  prettifyUnitCodes,
  unitLabel,
} from '@/lib/units'
import type { IFoodVariant } from '@/models/Food'

export type ServingChoiceGroup = 'servings' | 'weight' | 'volume'

export interface ServingOptionVariant {
  servingSize: IFoodVariant['servingSize']
  servingUnit: IFoodVariant['servingUnit']
  displayLabel?: IFoodVariant['displayLabel']
  alternateServings?: IFoodVariant['alternateServings']
  gramsPerServing?: IFoodVariant['gramsPerServing']
  mlPerServing?: IFoodVariant['mlPerServing']
}

export interface ServingChoice {
  id: string
  group: ServingChoiceGroup
  label: string
  quantity: number
  unit: Unit
  gramsPerServing?: number
  mlPerServing?: number
  derivedFromLabel?: string
}

export interface ServingChoiceGroups {
  servings: ServingChoice[]
  weight: ServingChoice[]
  volume: ServingChoice[]
  all: ServingChoice[]
  /** The food's own measurable dimension (from its serving) — the UI shows this
   *  unit group FIRST, so a drink lists Volume before Weight and a solid the
   *  reverse. undefined when the food is discrete with no bridge. */
  primaryFamily?: 'mass' | 'volume'
}

// Generic metric units offered per dimension — broad, so the dropdown gives
// real variety (mirrors the reference food-logger). Order = most→least common.
const MASS_UNITS: Unit[] = ['g', 'oz', 'lb', 'kg', 'mg']
const VOLUME_UNITS: Unit[] = ['tsp', 'tbsp', 'fl_oz', 'ml', 'cup', 'pint', 'quart', 'liter']
const DISCRETE_UNITS = new Set<Unit>(['each', 'slice', 'scoop', 'serving'])

const QUANTITY_WITH_UNIT_RE =
  /(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\.?\d+|[½¼¾⅓⅔⅛⅜⅝⅞])\s*(?:fl\s*oz|fluid\s*ounces?|milliliters?|millilitres?|kilograms?|milligrams?|grams?|ounces?|pounds?|cups?|tablespoons?|teaspoons?|pints?|quarts?|liters?|litres?|mls?|gr|g|oz|lbs?|lb|kgs?|kg|mg|c\.?|tbsp|tbs|tbl|tsp|pt|qt)\b/gi

export function buildServingChoiceGroups(variant: ServingOptionVariant): ServingChoiceGroups {
  const servings = buildServingChoices(variant)
  const bridge = bestDerivedBridge(variant, servings)
  // A unit family only appears when the food can resolve it (natively or via a
  // bridge) — that's what keeps mass-only foods off volume units and vice versa.
  // The food's actual gram/ml serving weight is already carried by its named
  // serving label ("1 bag (38 g)"), so we don't add a separate "38 g" entry —
  // that read as a confusing duplicate next to the bare "g" unit selector.
  const weight = buildUnitChoices('weight', MASS_UNITS, variant, bridge)
  const volume = buildUnitChoices('volume', VOLUME_UNITS, variant, bridge)

  // Order the two unit groups by the food's OWN dimension: a drink ("12 fl oz")
  // lists Volume first, a solid ("112 g") lists Weight first.
  const primUnit = (servings[0]?.unit ?? variant.servingUnit) as Unit
  const primFam = familyOf(primUnit)
  const primaryFamily: 'mass' | 'volume' | undefined =
    primFam === 'mass' || primFam === 'volume' ? primFam
      : variant.mlPerServing ? 'volume'
      : variant.gramsPerServing ? 'mass'
      : undefined
  const orderedMeasurable = primaryFamily === 'volume' ? [...volume, ...weight] : [...weight, ...volume]

  return {
    servings,
    weight,
    volume,
    all: [...servings, ...orderedMeasurable],
    primaryFamily,
  }
}

/**
 * The variant to do the maths against for a given serving choice, with the
 * choice's bridge applied.
 *
 * The choice's bridge wins here, and must: an ALTERNATE serving carries its own
 * weight, which is frequently not the variant's. Spinach stores
 * gramsPerServing 30 for "1 cup raw" and offers "1 cup cooked (180 g)" as an
 * alternate; scaling that alternate by the stored 30 g would be a six-fold
 * error. Whether the stored value should override is decided per choice in
 * choiceFromLabel, where it is known whether the label describes the variant's
 * own serving.
 */
export function variantForServingChoice<T extends ServingOptionVariant>(
  variant: T,
  choice?: Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing'> | null,
): T {
  if (!choice?.gramsPerServing && !choice?.mlPerServing) return variant
  return {
    ...variant,
    gramsPerServing: choice.gramsPerServing ?? variant.gramsPerServing,
    mlPerServing: choice.mlPerServing ?? variant.mlPerServing,
  }
}

export function findBestBridgeForUnit(
  groups: ServingChoiceGroups,
  unit: Unit,
): Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing'> | null {
  const withBridge = groups.all.find(choice =>
    choice.unit === unit && (choice.gramsPerServing != null || choice.mlPerServing != null)
  )
  return withBridge ?? null
}

function buildServingChoices(variant: ServingOptionVariant): ServingChoice[] {
  const choices: ServingChoice[] = []
  const native = variant.servingUnit as Unit
  const primaryLabel = variant.displayLabel || formatQuantity(primaryQuantity(variant), native)
  const primary = choiceFromLabel({
    id: 'serving-primary',
    label: primaryLabel,
    fallbackQuantity: primaryQuantity(variant),
    fallbackUnit: native,
    variant,
    isPrimary: true,
  })
  if (primary && shouldShowServingChoice(primary, primaryLabel, variant, true)) choices.push(primary)

  for (const [idx, alt] of (variant.alternateServings ?? []).entries()) {
    if (!alt?.label || !(alt.multiplier > 0)) continue
    const fallbackQuantity = variant.servingSize * alt.multiplier
    const choice = choiceFromLabel({
      id: `serving-alt-${idx}`,
      label: alt.label,
      fallbackQuantity,
      fallbackUnit: native,
      variant,
    })
    if (choice && shouldShowServingChoice(choice, alt.label, variant, false)) choices.push(choice)
  }

  const deduped = dedupeChoices(choices)
  if (deduped.length > 0) return deduped

  // EVERY food gets at least one serving — the "Servings" section anchors the
  // dropdown and lets picking it fill quantity + unit. If the food only has a
  // bare mass/volume native serving ("100 g"), that's fine, show it anyway
  // (shouldShowServingChoice would otherwise suppress it as unit-redundant).
  const forced = primary ?? choiceFromLabel({
    id: 'serving-primary', label: primaryLabel,
    fallbackQuantity: primaryQuantity(variant), fallbackUnit: native, variant,
    isPrimary: true,
  })
  if (forced) return [forced]
  return [{ id: 'serving-primary', group: 'servings', label: primaryLabel, quantity: primaryQuantity(variant), unit: native }]
}

function choiceFromLabel(args: {
  id: string
  label: string
  fallbackQuantity: number
  fallbackUnit: Unit
  variant: ServingOptionVariant
  /** True when this label describes the variant's OWN serving (the primary),
   *  so the variant's stored bridge and the label are two accounts of the same
   *  thing. Alternates describe a different amount and must not be overridden. */
  isPrimary?: boolean
}): ServingChoice | null {
  const label = prettifyUnitCodes(args.label).trim()
  if (!label || !(args.fallbackQuantity > 0)) return null

  const parsed = parseServingLabel(label)
  const derived = deriveBridge(args.variant, parsed, args.fallbackQuantity, args.fallbackUnit)

  // For the PRIMARY, the stored bridge and the label describe the same serving,
  // so when they disagree the stored one wins: it is the weight the nutrition is
  // actually recorded against, while the label is a rounded household
  // approximation of it. A tin of sardines is labelled "1 can (3.75 oz)" (106 g)
  // but stores the 92 g drained weight its 191 cal are based on; deriving 106 g
  // from the label overstates the can by 16%.
  //
  // Per-field, so a variant storing only gramsPerServing still accepts a derived
  // mlPerServing. Where both are involved the derived value is computed FROM the
  // stored one, so the pair stays self-consistent.
  const bridge = args.isPrimary && derived
    ? {
        gramsPerServing: args.variant.gramsPerServing ?? derived.gramsPerServing,
        mlPerServing: args.variant.mlPerServing ?? derived.mlPerServing,
      }
    : derived

  let quantity = args.fallbackQuantity
  let unit = args.fallbackUnit

  if (parsed.volume && bridge) {
    quantity = parsed.volume.value
    unit = parsed.volume.unit
  } else if (DISCRETE_UNITS.has(args.fallbackUnit) && hasServingWords(label)) {
    quantity = args.fallbackQuantity
    unit = args.fallbackUnit
  } else if (parsed.mass) {
    quantity = parsed.mass.value
    unit = parsed.mass.unit
  } else if (parsed.volume) {
    quantity = parsed.volume.value
    unit = parsed.volume.unit
  } else if (DISCRETE_UNITS.has(args.fallbackUnit)) {
    quantity = args.fallbackQuantity
    unit = args.fallbackUnit
  }

  const choice: ServingChoice = {
    id: args.id,
    group: 'servings',
    label,
    quantity,
    unit,
    gramsPerServing: bridge?.gramsPerServing,
    mlPerServing: bridge?.mlPerServing,
    derivedFromLabel: bridge ? label : undefined,
  }

  return canResolveChoice(args.variant, choice) ? choice : null
}

function buildUnitChoices(
  group: 'weight' | 'volume',
  units: Unit[],
  variant: ServingOptionVariant,
  derivedBridge: Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing'> | null,
): ServingChoice[] {
  const out: ServingChoice[] = []
  for (const unit of units) {
    const bridge = bridgeForUnit(unit, variant, derivedBridge)
    const choice: ServingChoice = {
      id: `${group}-${unit}`,
      group,
      label: unitLabel(unit),
      quantity: 1,
      unit,
      gramsPerServing: bridge?.gramsPerServing,
      mlPerServing: bridge?.mlPerServing,
      derivedFromLabel: bridge?.derivedFromLabel,
    }
    if (canResolveChoice(variant, choice)) out.push(choice)
  }
  return out
}

function bridgeForUnit(
  unit: Unit,
  variant: ServingOptionVariant,
  derivedBridge: (Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing' | 'derivedFromLabel'>) | null,
): (Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing' | 'derivedFromLabel'>) | null {
  const targetFamily = familyOf(unit)
  const nativeFamily = familyOf(variant.servingUnit as Unit)

  if (targetFamily === nativeFamily) return null
  if (targetFamily === 'mass' && variant.gramsPerServing != null) {
    return { gramsPerServing: variant.gramsPerServing }
  }
  if (targetFamily === 'volume' && variant.mlPerServing != null) {
    return { mlPerServing: variant.mlPerServing }
  }
  if (targetFamily === 'volume' && derivedBridge?.mlPerServing != null) {
    return derivedBridge
  }
  if (targetFamily === 'mass' && derivedBridge?.gramsPerServing != null) {
    return derivedBridge
  }
  return null
}

function bestDerivedBridge(
  variant: ServingOptionVariant,
  choices: ServingChoice[],
): Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing' | 'derivedFromLabel'> | null {
  const nativeFamily = familyOf(variant.servingUnit as Unit)
  if (nativeFamily === 'discrete') {
    const match = choices.find(choice => choice.gramsPerServing != null || choice.mlPerServing != null)
    if (match) {
      return {
        gramsPerServing: match.gramsPerServing,
        mlPerServing: match.mlPerServing,
        derivedFromLabel: match.derivedFromLabel,
      }
    }
    return null
  }

  const desired = nativeFamily === 'mass' ? 'mlPerServing' : 'gramsPerServing'
  const match = choices.find(choice => choice[desired] != null)
  if (match) {
    return {
      gramsPerServing: match.gramsPerServing,
      mlPerServing: match.mlPerServing,
      derivedFromLabel: match.derivedFromLabel,
    }
  }
  return null
}

function parseServingLabel(label: string): {
  mass?: { value: number; unit: Unit }
  volume?: { value: number; unit: Unit }
} {
  const matches = label.match(QUANTITY_WITH_UNIT_RE) ?? []
  let mass: { value: number; unit: Unit } | undefined
  let volume: { value: number; unit: Unit } | undefined

  for (const raw of matches) {
    const parsed = parseQuantityString(raw)
    if (!parsed) continue
    const family = familyOf(parsed.unit)
    if (family === 'mass' && !mass) mass = parsed
    if (family === 'volume' && !volume) volume = parsed
  }

  return { mass, volume }
}

function deriveBridge(
  variant: ServingOptionVariant,
  parsed: ReturnType<typeof parseServingLabel>,
  fallbackQuantity: number,
  fallbackUnit: Unit,
): Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing'> | null {
  const labelGrams = parsed.mass ? convert(parsed.mass.value, parsed.mass.unit, 'g') : null
  const labelMl = parsed.volume ? convert(parsed.volume.value, parsed.volume.unit, 'ml') : null

  const native = variant.servingUnit as Unit
  const nativeFamily = familyOf(native)

  if (labelGrams != null && labelMl != null && labelGrams > 0 && labelMl > 0 && nativeFamily === 'mass') {
    const nativeGrams = convert(variant.servingSize, native, 'g')
    return { mlPerServing: (nativeGrams / labelGrams) * labelMl }
  }

  if (labelGrams != null && labelMl != null && labelGrams > 0 && labelMl > 0 && nativeFamily === 'volume') {
    const nativeMl = convert(variant.servingSize, native, 'ml')
    return { gramsPerServing: (nativeMl / labelMl) * labelGrams }
  }

  if (labelGrams != null && labelMl != null && labelGrams > 0 && labelMl > 0 && nativeFamily === 'discrete') {
    const grams = variant.gramsPerServing
    const ml = variant.mlPerServing
    if (grams != null && grams > 0) return { mlPerServing: (grams / labelGrams) * labelMl }
    if (ml != null && ml > 0) return { gramsPerServing: (ml / labelMl) * labelGrams }
    return {
      gramsPerServing: bridgePerNativeServing(labelGrams, variant, fallbackQuantity, fallbackUnit),
      mlPerServing: bridgePerNativeServing(labelMl, variant, fallbackQuantity, fallbackUnit),
    }
  }

  if (labelMl != null && labelMl > 0 && nativeFamily === 'mass' && variant.gramsPerServing != null && variant.gramsPerServing > 0) {
    const nativeGrams = convert(variant.servingSize, native, 'g')
    return { mlPerServing: (nativeGrams / variant.gramsPerServing) * labelMl }
  }

  if (labelGrams != null && labelGrams > 0 && nativeFamily === 'volume' && variant.mlPerServing != null && variant.mlPerServing > 0) {
    const nativeMl = convert(variant.servingSize, native, 'ml')
    return { gramsPerServing: (nativeMl / variant.mlPerServing) * labelGrams }
  }

  if (nativeFamily === 'discrete') {
    if (labelGrams != null && labelGrams > 0) {
      return { gramsPerServing: bridgePerNativeServing(labelGrams, variant, fallbackQuantity, fallbackUnit) }
    }
    if (labelMl != null && labelMl > 0) {
      return { mlPerServing: bridgePerNativeServing(labelMl, variant, fallbackQuantity, fallbackUnit) }
    }
  }

  // Last resort: the label measures the SAME serving the servingSize does, just
  // in the other dimension. "1/3 c" on a 32 g serving means one serving is both
  // 32 g and 1/3 cup — that IS the density, for this food, and no separate
  // gramsPerServing/mlPerServing is needed to know it.
  //
  // Without this the choice can't convert to the storage unit, canResolveChoice
  // drops it, and the food's real serving disappears from the picker: a casein
  // powder labelled "1/3 c" defaulted to a bare "100 g" (344 cal) with 1/3 cup
  // nowhere in the list. Everything above is more specific — a label carrying
  // BOTH dimensions, or a variant with an explicit bridge — so this only fires
  // when the label alone has to supply the relationship.
  if (nativeFamily === 'mass' && labelMl != null && labelMl > 0) {
    return { mlPerServing: bridgePerNativeServing(labelMl, variant, fallbackQuantity, fallbackUnit) }
  }
  if (nativeFamily === 'volume' && labelGrams != null && labelGrams > 0) {
    return { gramsPerServing: bridgePerNativeServing(labelGrams, variant, fallbackQuantity, fallbackUnit) }
  }

  return null
}

function canResolveChoice(variant: ServingOptionVariant, choice: ServingChoice): boolean {
  if (!(choice.quantity > 0)) return false
  const effective = variantForServingChoice(variant, choice)
  const target = effective.servingUnit as Unit
  const source = choice.unit
  if (source === target) return true
  if (familyOf(source) === familyOf(target)) {
    try {
      convert(choice.quantity, source, target)
      return true
    } catch {
      return false
    }
  }
  return convertWithBridge(choice.quantity, source, target, {
    servingSize: effective.servingSize,
    servingUnit: target,
    gramsPerServing: effective.gramsPerServing,
    mlPerServing: effective.mlPerServing,
  }) != null
}

function primaryQuantity(variant: ServingOptionVariant): number {
  if (variant.servingUnit === 'g' && variant.gramsPerServing != null && variant.gramsPerServing > 0 && Math.abs(variant.gramsPerServing - variant.servingSize) > 0.001) {
    return variant.gramsPerServing
  }
  if (variant.servingUnit === 'ml' && variant.mlPerServing != null && variant.mlPerServing > 0 && Math.abs(variant.mlPerServing - variant.servingSize) > 0.001) {
    return variant.mlPerServing
  }
  return variant.servingSize
}

function bridgePerNativeServing(
  labelAmount: number,
  variant: ServingOptionVariant,
  fallbackQuantity: number,
  fallbackUnit: Unit,
): number {
  const native = variant.servingUnit as Unit
  if (fallbackUnit === native && fallbackQuantity > 0 && variant.servingSize > 0) {
    return (labelAmount / fallbackQuantity) * variant.servingSize
  }
  return labelAmount
}

function shouldShowServingChoice(
  choice: ServingChoice,
  rawLabel: string,
  variant: ServingOptionVariant,
  isPrimary: boolean,
): boolean {
  const label = prettifyUnitCodes(rawLabel).trim()
  if (!label || isBareNumberLabel(label)) return false

  // Suppress a PRIMARY only when its label is a bare gram/ml amount ("100 g",
  // "240 ml") — those duplicate the weight/volume unit selectors and read as
  // arbitrary. A real named serving ("3 oz cooked", "1 cup", "1 tbsp", "1 medium")
  // is the food's intended default and must always show + be selectable first.
  if (isPrimary && /^\s*\d+(?:\.\d+)?\s*(?:g|ml|grams?|milli(?:litre|liter)s?)\s*$/i.test(label)) {
    return false
  }

  return true
}

function isBareNumberLabel(label: string): boolean {
  return parseQuantityString(`${label} g`) != null && !/[a-z]/i.test(label)
}

function hasServingWords(label: string): boolean {
  const withoutMeasuredAmounts = label
    .replace(QUANTITY_WITH_UNIT_RE, ' ')
    .replace(/[()\[\],.]/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, ' ')
    .trim()
  return /[a-z]/i.test(withoutMeasuredAmounts)
}

function dedupeChoices(choices: ServingChoice[]): ServingChoice[] {
  const seen = new Set<string>()
  const out: ServingChoice[] = []
  for (const choice of choices) {
    const key = `${choice.group}|${choice.label.toLowerCase()}|${choice.unit}|${Math.round(choice.quantity * 1000)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(choice)
  }
  return out
}
