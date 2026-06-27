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
}

const MASS_UNITS: Unit[] = ['g', 'oz', 'lb']
const VOLUME_UNITS: Unit[] = ['ml', 'fl_oz', 'cup', 'tbsp', 'tsp']
const DISCRETE_UNITS = new Set<Unit>(['each', 'slice', 'scoop', 'serving'])

const QUANTITY_WITH_UNIT_RE =
  /(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\.?\d+|[½¼¾⅓⅔⅛⅜⅝⅞])\s*(?:fl\s*oz|fluid\s*ounces?|milliliters?|millilitres?|grams?|ounces?|pounds?|cups?|tablespoons?|teaspoons?|mls?|gr|g|oz|lbs?|lb|c\.?|tbsp|tbs|tbl|tsp)\b/gi

export function buildServingChoiceGroups(variant: ServingOptionVariant): ServingChoiceGroups {
  const servings = buildServingChoices(variant)
  const bridge = bestDerivedBridge(variant, servings)
  const weight = buildUnitChoices('weight', MASS_UNITS, variant, bridge)
  const volume = buildUnitChoices('volume', VOLUME_UNITS, variant, bridge)

  return {
    servings,
    weight,
    volume,
    all: [...servings, ...weight, ...volume],
  }
}

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
  const primary = choiceFromLabel({
    id: 'serving-primary',
    label: variant.displayLabel || formatQuantity(primaryQuantity(variant), native),
    fallbackQuantity: primaryQuantity(variant),
    fallbackUnit: native,
    variant,
  })
  if (primary) choices.push(primary)

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
    if (choice) choices.push(choice)
  }

  return dedupeChoices(choices)
}

function choiceFromLabel(args: {
  id: string
  label: string
  fallbackQuantity: number
  fallbackUnit: Unit
  variant: ServingOptionVariant
}): ServingChoice | null {
  const label = prettifyUnitCodes(args.label).trim()
  if (!label || !(args.fallbackQuantity > 0)) return null

  const parsed = parseServingLabel(label)
  const bridge = deriveBridge(args.variant, parsed)

  let quantity = args.fallbackQuantity
  let unit = args.fallbackUnit

  if (parsed.volume && bridge) {
    quantity = parsed.volume.value
    unit = parsed.volume.unit
  } else if (parsed.mass) {
    quantity = parsed.mass.value
    unit = parsed.mass.unit
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
  const desired = nativeFamily === 'mass' || nativeFamily === 'discrete' ? 'mlPerServing' : 'gramsPerServing'
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
): Pick<ServingChoice, 'gramsPerServing' | 'mlPerServing'> | null {
  if (!parsed.mass || !parsed.volume) return null

  const labelGrams = convert(parsed.mass.value, parsed.mass.unit, 'g')
  const labelMl = convert(parsed.volume.value, parsed.volume.unit, 'ml')
  if (!(labelGrams > 0) || !(labelMl > 0)) return null

  const native = variant.servingUnit as Unit
  const nativeFamily = familyOf(native)

  if (nativeFamily === 'mass') {
    const nativeGrams = convert(variant.servingSize, native, 'g')
    return { mlPerServing: (nativeGrams / labelGrams) * labelMl }
  }

  if (nativeFamily === 'volume') {
    const nativeMl = convert(variant.servingSize, native, 'ml')
    return { gramsPerServing: (nativeMl / labelMl) * labelGrams }
  }

  if (nativeFamily === 'discrete') {
    const grams = variant.gramsPerServing
    const ml = variant.mlPerServing
    if (grams != null && grams > 0) return { mlPerServing: (grams / labelGrams) * labelMl }
    if (ml != null && ml > 0) return { gramsPerServing: (ml / labelMl) * labelGrams }
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
