# Foods, Servings, & Units Plan — Become

Last updated: 2026-05-08

The food picker currently defaults every input to **100 g**, and recipe-sourced custom foods say **"1 each"**. Both are wrong defaults that fight the data the system already has. This plan replaces them with a unit-aware, serving-first model that honors how the user actually thinks about food (cups, ounces, slices, portions) while keeping the math defensible.

This doc is the source of truth. Hand it to executing agents. If you discover something the plan missed, edit the plan first, then implement.

---

## 1. Goals

1. **Default to one real serving**, never 100 g. The user shouldn't see "100 g" unless that genuinely is one serving.
2. **Quick options match the food's domain**. A cup-based food shows cup quick options + a fl-oz/ml toggle in custom input. A gram-based food shows gram options + an oz toggle. A "slice"-based food shows half/whole slice + an optional gram-equivalent input if the variant has one.
3. **All math goes through one canonical conversion**: a numeric `quantity` × `unit` resolved against the variant's per-unit nutrition. No per-surface ad-hoc math.
4. **Cross-domain conversion (mass ↔ volume) is opt-in via density**. We don't fake it. If a variant has `gramsPerServing` and `mlPerServing` declared, we expose the cross-domain conversion in the UI; otherwise we don't.
5. **Recipe-sourced custom foods say "1 serving"**, not "1 each", and pre-populate `gramsPerServing` from the recipe totals when they're known.
6. **One trip through the picker should always be reversible**: every logged item carries enough provenance (`quantity`, `unit`, `gramsAtLog`, `mlAtLog`) to be re-edited, re-converted, or re-displayed without re-deriving from `multiplier`.

## 2. Non-goals

- Don't add a NPM dep for unit conversion. The conversion table is small and static — `webapp/lib/units.ts` covers it.
- Don't redesign the meal log shape, the daily tag system, or the recipe builder. Adjust their inputs, not their data flow.
- Don't try to auto-derive density from name heuristics ("looks like a liquid → assume 1 g/ml"). Either we have the bridge or we don't.
- Don't break existing logged items. Old entries that only have a `multiplier` keep working — we just stop creating new ones in that shape.
- Don't ship a unit converter visible to all users in all places. Picker UI gets the convert toggle; the daily log row stays simple.

---

## 3. Current state (quick reference)

| Concept | Where it lives | Notes |
|---|---|---|
| `IFoodVariant.servingSize` (number) | `models/Food.ts` | nutrition is per `servingSize × servingUnit` |
| `IFoodVariant.servingUnit` (`g`/`oz`/`cup`/`each`/`ml`/`tbsp`/`tsp`/`slice`/`scoop`) | `models/Food.ts` | the unit the nutrition row is in |
| `IFoodVariant.displayLabel` (string?) | `models/Food.ts` | human label like "1 cup (240 ml)" — presentation-only |
| `IFoodVariant.alternateServings: [{label, multiplier}]` | `models/Food.ts` | multipliers off the base serving |
| `customGrams` state (default `'100'`) | `components/nutrition/FoodSearchModal.tsx:200,276,844` | the broken default |
| Picker math | `FoodSearchModal.tsx ~490–502` | `effectiveServings = grams/baseGrams` OR `servings × multiplier` |
| Save-as-food → "1 each" | `app/api/meals/[id]/save-as-food/route.ts:78–85` | the broken recipe-derived label |
| Log shape (`MealLog.items`) | `models/Meal.ts` (`IMealItem`) | snapshots `servingSize, servingUnit, nutrition` per entry |

---

## 4. Design tokens (the rules everything has to obey)

### 4.0 Storage vs input/display (READ THIS FIRST)

**Storage is canonical**: bridges are stored as `gramsPerServing` (mass) and `mlPerServing` (volume). A single canonical unit per family makes the math one-line. The user never sees "grams" or "ml" unless they choose that unit themselves.

**Input is freeform**: anywhere a user types a quantity (picker custom mode, bridge entry on a new variant, recipe weight-per-serving field, edit-food modal), the input accepts ANY unit in the relevant family. A user can type:
- `1 cup`, `½ cup`, `0.5 cup`
- `8 fl oz`, `8oz`, `1.5 oz`, `3.5oz`
- `240 ml`, `100g`, `100 g`, `1 lb`, `2 tbsp`, `1.5 tsp`

`parseQuantityString()` handles it. No user is ever forced to think in grams or ml.

**Display follows the user's choice**: if the user logged "1 cup", the daily log row shows "1 cup", not "240 ml". The canonical value is stored alongside (`loggedGramsPerServing` snapshot) for re-edit, but presentation respects intent.

This applies everywhere: search picker, edit modal, recipe creator, custom-food form, log row display.

### 4.1 Unit families

```ts
// webapp/lib/units.ts

export type UnitFamily = 'mass' | 'volume' | 'discrete'

export type Unit =
  // mass
  | 'g' | 'oz' | 'lb'
  // volume
  | 'ml' | 'fl_oz' | 'cup' | 'tbsp' | 'tsp'
  // discrete (no cross-conversion without density)
  | 'each' | 'slice' | 'scoop' | 'serving'
```

`'serving'` is a synthetic unit that always means "one variant's `servingSize × servingUnit`". It never appears as `IFoodVariant.servingUnit` — it's a render-time concept used by the picker and the save-as-food path.

### 4.2 Conversion table (canonical)

```ts
// To gram per unit (mass family)
const GRAMS: Record<Extract<Unit, 'g' | 'oz' | 'lb'>, number> = {
  g: 1,
  oz: 28.3495,
  lb: 453.592,
}

// To ml per unit (volume family)
const ML: Record<Extract<Unit, 'ml' | 'fl_oz' | 'cup' | 'tbsp' | 'tsp'>, number> = {
  ml: 1,
  fl_oz: 29.5735,    // US fluid ounces
  cup: 240,           // US legal cup
  tbsp: 14.7868,      // US tablespoon
  tsp: 4.92892,       // US teaspoon
}
```

Use US units. Don't try to detect locale.

### 4.3 The picker domain

A variant's domain is determined by its `servingUnit`:

| `servingUnit` | family | default custom-input unit | quick options |
|---|---|---|---|
| `g`, `oz`, `lb` | mass | `g` (or `oz` if user prefers — see 4.4) | `½ × serving`, `1 × serving`, `2 × serving`, plus the `displayLabel` if present |
| `ml`, `fl_oz`, `cup`, `tbsp`, `tsp` | volume | matches the serving's unit | same |
| `each`, `slice`, `scoop`, `serving` | discrete | none — use a `× serving` stepper | `½`, `1`, `2`, `3`, `Custom…` |

For mass + volume families, when the variant exposes a cross-domain bridge (`gramsPerServing` for volume foods or `mlPerServing` for mass foods), the custom input gets a small unit toggle that lets the user enter a value in the OTHER family. Without the bridge, no toggle.

### 4.4 User unit preference

Already in the User model: `weightUnit: 'kg' | 'lbs'` (per `UserProfile`). We add an analogous concept implicitly — the picker's custom input default unit follows this preference for mass-family foods (`g` if `kg`, `oz` if `lbs`). Volume default stays the food's native (no separate volume preference).

### 4.5 Quick-option count

**Hard cap: 3 visible quick options + a Custom button.** Keep simplicity (per `feedback_nutrition_ux.md`). If the variant has >3 alternate servings, prefer:

1. The base serving (e.g. "1 cup")
2. The half (e.g. "½ cup")
3. The double (e.g. "2 cups")

Push the rest behind Custom. Don't ever show 5+ chips.

---

## 5. Data model changes

### 5.1 `IFoodVariant` additions

Add two optional fields to `webapp/models/Food.ts`. **These are the canonical storage form of the bridge — input UIs must NOT force users to enter values in grams or ml. See §4.0.**

```ts
export interface IFoodVariant {
  // ...existing fields...

  /**
   * Cross-domain bridge — grams in one canonical serving (servingSize × servingUnit).
   * Stored canonical; on input the user may type any mass unit (oz, lb, g) and
   * the form converts before persisting. Populated from:
   *   - USDA: parsed from householdServingFullText when it includes a gram value
   *   - OpenFoodFacts: parsed from serving_size text
   *   - Manual / recipe-sourced: optional; recipe save-as-food sets it from totals
   *   - User: typed as oz/lb/cup/ml/g; parsed + converted before write
   */
  gramsPerServing?: number

  /**
   * Cross-domain bridge — millilitres in one canonical serving.
   * Stored canonical; users can enter as fl oz, cup, tbsp, tsp, ml.
   */
  mlPerServing?: number
}
```

Both nullable. Don't add validation that requires them.

Schema update in `Food.ts`:

```ts
const VariantSchema = new Schema<IFoodVariant>({
  // ...existing fields...
  gramsPerServing: { type: Number },
  mlPerServing: { type: Number },
}, { _id: true })
```

### 5.2 `IMealItem` additions (provenance for editing)

Add to `webapp/models/Meal.ts`:

```ts
export interface IMealItem {
  // ...existing fields...

  /** What the user actually entered: number + unit. Mirrors the picker state. */
  loggedQuantity?: number
  loggedUnit?: Unit
  /** Snapshot of the bridge values at log time — lets re-edit show the right toggle. */
  loggedGramsPerServing?: number
  loggedMlPerServing?: number
}
```

These coexist with the existing `multiplier` field. New entries fill them; old entries don't have them and the UI degrades gracefully (back-compat: synthesize from `multiplier × servingSize`).

### 5.3 `ServingUnit` type

`models/Food.ts` keeps the existing `ServingUnit` enum exactly. It's the *storage* unit. The picker internally widens to the full `Unit` set from `lib/units.ts` for input/display purposes only.

---

## 6. The units library (`webapp/lib/units.ts`)

New file. No external deps. Exports:

```ts
export type UnitFamily = 'mass' | 'volume' | 'discrete'
export type Unit = 'g'|'oz'|'lb'|'ml'|'fl_oz'|'cup'|'tbsp'|'tsp'|'each'|'slice'|'scoop'|'serving'

/** Family the unit belongs to. */
export function familyOf(u: Unit): UnitFamily

/** Convert within a family. Throws for cross-family. */
export function convert(value: number, from: Unit, to: Unit): number

/**
 * Cross-domain conversion using a per-serving bridge. Returns null if the
 * bridge isn't present.
 *
 * Example: a "1 cup" variant with gramsPerServing=120 → convert 0.5 cups
 * to grams: convertWithBridge(0.5, 'cup', 'g', { gramsPerServing: 120, ... }).
 */
export function convertWithBridge(
  value: number,
  from: Unit,
  to: Unit,
  variant: { servingSize: number; servingUnit: Unit; gramsPerServing?: number; mlPerServing?: number },
): number | null

/** Format for UI: 240 ml → '240 ml', 0.5 cup → '½ cup', 1 → '1', 1.5 → '1½'. */
export function formatQuantity(value: number, unit: Unit): string

/** Display label for a unit. 'fl_oz' → 'fl oz', 'each' → 'each' (or 'serving'?). */
export function unitLabel(u: Unit): string

/** Suggested companion unit for the custom input toggle. */
export function suggestedToggleUnit(servingUnit: Unit, weightPref: 'kg' | 'lbs'): Unit | null
//   g/oz/lb       -> 'oz' if pref=lbs else 'g'
//   ml/fl_oz/cup  -> 'fl_oz' if pref=lbs else 'ml'
//   each/slice/scoop/serving -> null

/**
 * Parse a freeform "240 g" / "1 cup" / "8 fl oz" / "1.5 oz" / "150ml"
 * string into { value, unit }. Returns null if it can't be parsed.
 */
export function parseQuantityString(input: string): { value: number; unit: Unit } | null
```

Test plan: include a `webapp/lib/units.test.ts` if a test runner is configured (per CLAUDE.md, none is — so skip and document the conversion factors in the code with brief comments).

---

## 7. Picker UX spec (`FoodSearchModal.tsx` + `EditFoodModal.tsx` + recipe builder picker)

### 7.1 Replace the input model

Drop the binary `inputMode: 'servings' | 'grams'` toggle and the `customGrams: '100'` default.

New picker state:

```ts
type QuickOption = {
  id: string                  // stable key for keyed render
  label: string               // 'half', '1 cup', '2 cups', etc.
  quantity: number
  unit: Unit
}

const [activeOption, setActiveOption] = useState<QuickOption | null>(null) // null = custom mode
const [customValue, setCustomValue] = useState('')                          // empty until first edit
const [customUnit, setCustomUnit] = useState<Unit>(/* derived */)
```

### 7.2 Default state on food select

```ts
function pickerDefaults(variant: IFoodVariant, weightPref: 'kg'|'lbs'): {
  options: QuickOption[]
  initialActive: QuickOption
  initialCustomUnit: Unit
}
```

- `options[0]` is **one serving** at the variant's native unit (label uses `displayLabel` if present, otherwise `1 ${unit}`).
- `options[1]` is `0.5 × serving` (label "½ ${unit}" or "½ serving" for discrete).
- `options[2]` is `2 × serving` (label "2 ${unit}" or "2 servings").
- `initialActive = options[0]`.
- `initialCustomUnit = suggestedToggleUnit(variant.servingUnit, weightPref) ?? variant.servingUnit`.

If the variant has more than 3 entries in `alternateServings`, only the first one (the most useful) survives; the rest are dropped.

The `displayLabel` text takes priority for `options[0].label` when present.

### 7.3 Custom mode

The "Custom" button puts the picker into custom mode:

- Clears `activeOption` (sets to `null`).
- Shows a single number input + a unit dropdown to its right.
- Unit dropdown lists ALL units in the variant's family (e.g. for cup-native: `cup`, `tbsp`, `tsp`, `fl_oz`, `ml`).
- IF the variant has a bridge (`gramsPerServing` or `mlPerServing`), the dropdown also includes the cross-family units (e.g. `g`, `oz`).
- Otherwise no cross-family options — keeps math honest.
- Default unit is `suggestedToggleUnit(...)`.

Live nutrition preview updates as the user types or changes unit.

### 7.4 Math (single function)

```ts
// webapp/lib/foodMath.ts (new)

export function nutritionForQuantity(
  variant: IFoodVariant,
  quantity: number,
  unit: Unit,
): IFoodNutrition {
  const factor = scalingFactor(variant, quantity, unit)
  return scaleNutrition(variant.nutrition, factor)
}

function scalingFactor(variant, quantity, unit): number {
  // 1. If unit equals variant.servingUnit: factor = quantity / variant.servingSize
  // 2. If unit is in same family as variant.servingUnit:
  //      convert(quantity, unit, variant.servingUnit) / variant.servingSize
  // 3. If unit is in a different family but variant has a bridge:
  //      use convertWithBridge to get to variant.servingUnit, then divide
  // 4. Otherwise throw — UI shouldn't allow this combination.
}
```

Every nutrition preview goes through this. `customGrams / 100` math gets deleted.

### 7.5 Submit shape

When the user logs an item, send:

```ts
{
  foodId,
  variantId,
  quantity: number,
  unit: Unit,
  // computed at submit time as a snapshot for back-compat / list display:
  servingSize,        // the variant's
  servingUnit,        // the variant's
  multiplier,         // factor as above (UI displays "1.0×" style)
  nutrition,          // scaled
  loggedGramsPerServing: variant.gramsPerServing,
  loggedMlPerServing: variant.mlPerServing,
}
```

Old entries don't have `loggedQuantity`/`loggedUnit`; they keep working off `multiplier` for display.

---

## 8. The "1 each" → "1 serving" fix

`webapp/app/api/meals/[id]/save-as-food/route.ts` line 78–85 currently writes:

```ts
{ name: '1 serving', servingSize: 1, servingUnit: 'each', ... }
```

Change to:

```ts
{
  name: '1 serving',
  isDefault: true,
  servingSize: 1,
  servingUnit: 'serving',          // requires expanding ServingUnit (see 8.1)
  alternateServings: [],
  nutrition: perServing,
  // Bridge: if recipe.totalGrams or sum(items grams) is known, set:
  gramsPerServing: estimatedGramsPerServing(meal),
  mlPerServing: undefined,         // recipes are mass-aggregated; ml only if explicit
}
```

### 8.1 Add `'serving'` to `ServingUnit`

Update `models/Food.ts`:

```ts
export type ServingUnit =
  | 'g' | 'oz' | 'cup' | 'each' | 'ml' | 'tbsp' | 'tsp' | 'slice' | 'scoop'
  | 'serving'   // synthetic — only used for recipe-derived foods
```

`coerceServingUnit` in `webapp/lib/foodImport.ts` adds `'serving'` to its valid list.

### 8.2 Existing data

A one-shot script under `webapp/scripts/migrate-each-to-serving.ts`:

```ts
// Find every Food with a single variant whose name === '1 serving' AND
// servingUnit === 'each' AND servingSize === 1. Switch servingUnit to 'serving'.
// These are unambiguously recipe-derived rows (the save-as-food handler is the
// only producer of that exact triple).
```

Run once after deploy. Not idempotent-required but harmless to re-run.

### 8.3 Compute `gramsPerServing` from a recipe

`estimatedGramsPerServing(meal)` heuristic:

```ts
// 1. If meal.recipe?.servings is set and every meal.items[].servingSize is in
//    the mass family (g/oz/lb), sum total grams and divide by recipe.servings.
// 2. If items are volume-native and every variant has gramsPerServing, sum
//    those (× quantity used) and divide by recipe.servings.
// 3. Otherwise undefined (don't fake it).
```

Add to `webapp/lib/recipes.ts` (or wherever recipe math lives — search for `totalNutrition` to find it).

---

## 9. Import-time enrichment (USDA / OFF / manual)

Backfill `gramsPerServing` and `mlPerServing` during import so existing import paths just work after rebuild.

### 9.1 USDA

`webapp/lib/usda.ts` `mapUSDAFood`:

- USDA gives `servingSize`, `servingSizeUnit`, sometimes `householdServingFullText` like "1 cup (240 g)".
- If `servingSizeUnit` is mass and `servingSize` is set, populate `gramsPerServing = servingSize` (the unit IS grams).
- If `servingSizeUnit` is volume (ml), populate `mlPerServing = servingSize`. Try to parse a "(N g)" out of `householdServingFullText` to also set `gramsPerServing`.
- For Survey/Foundation foods reported per 100g: `gramsPerServing = 100`, `mlPerServing` undefined.

### 9.2 OpenFoodFacts

`webapp/lib/foodImport.ts` `mapOffToVariant`:

- Already extracts `actualGrams` from `serving_size` text. Set `gramsPerServing = actualGrams` when it's confident (≥5).
- For liquids (`isLiquid`), additionally set `mlPerServing = actualGrams` (since the unit was ml).
- Skip when neither parses cleanly.

### 9.3 Manual

`importManualFood` accepts `gramsPerServing` / `mlPerServing` on the variant input and persists them. The picker's "Edit" flow lets users edit these inline — see EditFoodModal updates below.

### 9.4 Backfill

`webapp/scripts/backfill-bridges.ts` — one-shot:

- For every Food with `source: 'usda'` or `'openfoodfacts'`, refetch the import logic against the existing record (re-run mapping using stored fields) and update bridges where missing. No upstream API call needed for OFF; for USDA, only run if `externalId` is present and USDA is reachable.
- For `source: 'manual'` with `servingUnit` in mass family, set `gramsPerServing = servingSize` if missing.

Skip foods that already have either bridge.

---

## 10. Per-surface migration map

### 10.1 `webapp/components/nutrition/FoodSearchModal.tsx`
- Drop `customGrams` / `inputMode` state.
- Add `activeOption` / `customValue` / `customUnit` state.
- Replace the `getLabelServingGrams` helper with `pickerDefaults` from `lib/foodMath.ts`.
- Replace effectiveServings computation (~lines 490–502) with `nutritionForQuantity`.
- Replace the grams-mode toggle UI (~find by `inputMode === 'grams'`) with the QuickOption row + Custom mode.
- Submit body uses the new shape (section 7.5).

### 10.2 `webapp/components/nutrition/EditFoodModal.tsx`
- Add an "Edit bridge" disclosure: optional `gramsPerServing` and `mlPerServing` inputs.
- Same picker treatment (drop `customGrams`).

### 10.3 `webapp/components/nutrition/QuickAddModal.tsx`
- Inherits the new picker subcomponent.

### 10.4 `webapp/components/meals/FoodLogSheet.tsx`
- Same picker subcomponent.

### 10.5 `webapp/components/meals/MealApplySheet.tsx`
- Each item in the meal already has its quantity baked in; this sheet doesn't change items, but display labels should switch to "× serving" wording.

### 10.6 `webapp/app/dashboard/foods/[id]/page.tsx`
- Variant editor exposes the bridge fields.

### 10.7 `webapp/app/dashboard/foods/new/page.tsx`
- Custom food creation form: when the user types a non-mass unit (e.g. cup), surface an optional bridge field labeled "Approx weight per serving (optional)".
- Bridge input is freeform (`parseQuantityString`). Accepts `100g`, `3.5 oz`, `1/4 lb`, etc. Form converts to canonical grams before submit.
- Symmetric optional volume bridge ("Approx volume per serving") for mass-native variants where the user knows it (e.g. "1 oz = 30 ml" for a thick liquid). Same parser.

### 10.8 `webapp/app/dashboard/nutrition/recipes/create/page.tsx` (and `edit`)
- Recipe creator: when finalizing, expose an optional "Weight per serving" field, freeform input ("3.5 oz", "100g", "1 cup" if the recipe is liquid).
- save-as-food path picks this up, parses to canonical grams (or ml for liquid recipes), and writes it to the new Food's variant.

### 10.9 Daily log row display
- `webapp/components/nutrition/TagSection.tsx` and meal card rows.
- Display: `${formatQuantity(loggedQuantity, loggedUnit)} • ${calories} cal` where present; fall back to existing `multiplier × servingSize` for old entries.

### 10.10 API surfaces — minimal changes
- `POST /api/nutrition/log` — accept the new fields (loggedQuantity, loggedUnit, etc.), keep accepting old shape.
- `GET /api/nutrition/foods/*` (search, recent, frequent, barcode) — passthrough the new variant fields. `flattenFoodForResponse` includes them.
- `POST /api/meals/[id]/save-as-food` — pass `gramsPerServing` to importManualFood (section 8).

---

## 11. Phased PRs (execution order)

1. **PR 1 — Foundation.** New `lib/units.ts`, `lib/foodMath.ts`. `Food` model + `Meal` model schema additions. `coerceServingUnit` accepts `'serving'`. No UI consumers yet. `tsc` + `next build` clean.
2. **PR 2 — Save-as-food fix.** Update `/api/meals/[id]/save-as-food` to write `servingUnit: 'serving'` and populate `gramsPerServing` when derivable. Run the migrate-each-to-serving script against prod.
3. **PR 3 — Import enrichment.** Update USDA + OFF + manual import paths to populate bridges. Run `backfill-bridges` against prod.
4. **PR 4 — Picker rework.** Replace `customGrams`/`inputMode` with the QuickOption + Custom system in `FoodSearchModal.tsx`, `EditFoodModal.tsx`, `QuickAddModal.tsx`, `FoodLogSheet.tsx`. Submit shape includes new fields.
5. **PR 5 — Variant editing surfaces.** Bridge fields in `dashboard/foods/[id]`, `dashboard/foods/new`, recipe create/edit. Daily log row uses logged-quantity display when present.

Each PR: branch `agent/units-pass-N-X`, against `beta`. Standing merge permission applies (per `AGENTS.md`).

---

## 12. Acceptance criteria

After all 5 PRs land:

- [ ] Open the food picker for any USDA food with `displayLabel` "1 cup (240 g)". Default shows "1 cup", quick options are `½ cup` / `1 cup` / `2 cups`. Custom unit toggle includes ml, fl oz, tbsp, tsp, AND grams (because the bridge exists).
- [ ] Open the picker for a USDA food without a household serving (only per-100g data). Default shows the meaningful per-package size when available, else falls to "100 g" — but there's no longer a generic "100 g" default for foods that DO have serving data.
- [ ] Save-as-food on a recipe writes a Food whose variant says `servingUnit: 'serving'`. Daily log row reads "1 serving · X cal".
- [ ] Recipe creator has an optional "Weight per serving" field that flows through to the saved Food.
- [ ] Old logged entries (without `loggedQuantity`) still render correctly using fallback math.
- [ ] `grep -r "'100'" webapp/components/nutrition` (the picker default) returns zero hits.
- [ ] `grep -r "servingUnit: 'each'" webapp/app/api/meals` returns zero hits.
- [ ] `tsc` + `next build` clean across all PRs.

---

## 13. Traps to avoid

- Don't change `IFoodVariant.servingUnit` semantics. It's still the unit nutrition is denominated in. New `Unit` type widens for input only — never assign a non-storage unit to a variant.
- Don't compute `gramsPerServing` from `servingSize` when the unit is `each`/`slice`/`scoop`/`serving`. That'd be lying; we don't know the gram weight.
- Don't introduce locale (UK ml ≠ US fl oz, etc). Hard-code US.
- Don't drop the existing `multiplier` field on log items. Keep it for back-compat reads. New writes set BOTH the multiplier AND the new fields.
- Don't expose the cross-family unit toggle when the bridge is missing. The whole point is honesty.
- Don't add a separate "preferred volume unit" preference. User pref is mass-only; volume defaults to native.
- Don't rebuild the meal log shape. New fields are additive.
- Recipe-derived `gramsPerServing`: only set when math is reliable. Recipes mixing `each` / `slice` items can't be summed in grams without bridges on every item — leave undefined in those cases.
- The tactical "1 each → 1 serving" fix happens server-side in PR 2. Don't try to fix it in the UI by string-replacing.
- For users on `weightUnit: 'lbs'`, default custom unit is `oz`, NOT `lb` — `oz` is the practical food-logging unit.
- Validate `quantity > 0` on submit. The picker should disable the log button when 0/empty.

---

## 14. Decisions (locked)

1. **Parser**: promote `extractGramsFromOffServing` from `app/api/nutrition/foods/route.ts` into `lib/units.ts` as `parseQuantityString` and reuse everywhere. Extend it to handle the full unit set (oz, lb, fl_oz, cup, tbsp, tsp, ml, g) plus fractions ("½ cup", "1/4 lb"). Use it for: bridge field input, custom mode input, OFF serving_size mining, USDA householdServingFullText mining.
2. **Edit-existing-log entries**: picker opens with the original `loggedQuantity` + `loggedUnit`. Old log rows (no `loggedQuantity`) are backfilled in PR 4: `loggedQuantity = item.servingSize × multiplier`, `loggedUnit = item.servingUnit`. Backfill is read-on-write: when an old row is read by the picker for editing, fill the synthetic values then; the next save persists them. Avoids a separate migration script.
3. **Density per variant**: confirmed. Bridges live on the variant, not the food. Raw oats vs cooked oats differ by ~3×; we have to keep them separate.
