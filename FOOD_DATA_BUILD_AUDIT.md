# Food Data — Build-Pipeline Audit & Improvement Plan

> Status: OPEN — plan for pickup. Written 2026-07-02 after the "generic foods are a
> mess" report (Coffee/Tea/Chicken searches). Complements `FOOD_DATA_QUALITY_SPEC.md`
> (which covers catalog *hygiene* — junk/dupes/macros). THIS doc is about **how we
> BUILD the data**: naming, variant-merging, default selection, serving labels, and
> ranking — plus a **scheduled** audit/improve job on the become automation push.

## 1. Symptoms (observed in search)
- `Coffee` → best match "Coffee" **919 cal**, garbled variants: "1 f food (226.796 g)",
  "425 mt (425 ml)"; coffee *grounds* (397 cal/100 g) shown as plain "Coffee".
- `Tea` → best match **"Beverages Tea"**, default variant **Powder (315 cal)** instead
  of **Brewed (1 cal)**; variant set is a merged mess (Powder / Unsweetened / Unsweetened (2) / Regular).
- `Chicken` → generic "Chicken" default variant **"Meatless" (224 cal)**; "No broth".
- Clean plain generics don't rank at the top; branded/garbage do.

## 2. Scope of the mess (prod, 3,474 foods — 2026-07-02)
- **45 (1.3%)** food names begin with a USDA **category** word ("Beverages …").
- **104 (3.0%)** are multi-variant **merged** foods; **~9** have an obviously non-plain
  DEFAULT variant (meatless / powder / …). Counts are small but they're the **top
  generics** (Coffee/Tea/Chicken), so the damage is outsized.
- (Plus the ~685 degenerate "1 g" servings and off-macro foods from the hygiene spec.)

## 3. Root causes (in the build pipeline)
| # | Problem | Where |
|---|---|---|
| A | Name = raw USDA `description` → keeps the leading category segment ("Beverages, tea, …" → "Beverages Tea"). No reorder of comma-form ("Coffee, brewed" → "Brewed Coffee"). | `lib/usda.ts` `mapUSDAFood` (`name: food.description`, ~L260/333) |
| B | Variant-merge folds **different foods** into one generic as "variants" (meatless chicken, tea powder, coffee grounds) via `groupKey`, with weak distinguishing checks. | `lib/foodVariantMerge.ts` + `lib/foodGrouping.ts` |
| C | **Default variant** isn't chosen for "plain / most sensible" — a high-cal prep (Powder 315, Meatless 224) wins. | merge path sets `isDefault`; `lib/foodImport.ts` |
| D | **Garbage serving labels** survive: "1 f food", "425 mt", raw "226.796 g" (unrounded, mis-parsed FNDDS portion text). | `lib/usda.ts` portion mapping / `foodImport` |
| E | Generic **ranking**: clean generics don't out-rank branded/garbled on a generic query. | `app/api/nutrition/foods/route.ts` search ranking |

## 4. Fixes — HOW we build the data
Each is independently shippable. Land at import time AND back-fill existing rows.

**Phase 1 — Names & serving labels (highest visibility, low risk)**
- `cleanFoodName(description, category)`: strip a leading category segment (Beverages,
  Snacks, Poultry Products, …); reorder comma-form USDA descriptions so the head noun
  leads ("Coffee, brewed, prepared" → "Coffee (brewed)"); collapse ALL-CAPS; trim
  "NS as to type / NFS / prepared" filler. Apply in `mapUSDAFood` and OFF import.
- `sanitizeServingLabel`: reject "1 f food", "N mt", round gram/ml to a readable value,
  and fall back to the plain unit when the label is garbled. (Feeds the "always ≥1
  serving" logic that already exists.)

**Phase 2 — Variant merge guardrails & default selection**
- In `foodVariantMerge`, DON'T merge a form that changes the food's identity into a
  plain generic: block `meatless|vegan|powder|concentrate|dehydrated|dry mix|substitute`
  from joining a plain-named parent (they become their own foods). Tighten the
  "same product, different prep" test (macros within tolerance AND same base noun).
- `pickDefaultVariant(variants)`: prefer the **plainest, most-consumed** form — lowest
  prep complexity, name without a qualifier, calories closest to the canonical value
  for that food class ("Brewed" over "Powder", plain "Chicken" over "Meatless").
  Rename merged variants to clean prep words (Brewed / Iced / Sweetened), de-dupe
  "Unsweetened (2)".

**Phase 3 — Search ranking for generics**
- For a short generic query ("coffee"), boost: source=usda/foundation, plain name
  (no brand, no qualifier), sensible calorie density, has a household serving. Penalize:
  garbled serving, implausible density, category-prefixed name. (Extends the existing
  ranking + the brand-evidence work already shipped.)

## 5. One-time cleanup (existing tooling + new fixers)
Already built (this session): `scripts/audit-foods-categorize.ts` (classifier),
`scripts/reconcile-foods-with-source.ts` + `scripts/reconcile-slow.ts` (re-fetch macros/
servings from source, resumable, half-rate-limited), and `./reconcile.sh`.
Add: `fix-food-names.ts` (Phase 1 name/label cleanup), `resplit-bad-variants.ts`
(Phase 2 un-merge identity-changing variants), `fix-default-variants.ts` (Phase 2
default selection). All dry-run first.

## 6. Scheduled audit/improve on the become push (the ask)
Add a **nightly cron** so the catalog self-heals as new foods land:
- New route `app/api/cron/food-audit/route.ts` (guarded by `CRON_SECRET`, same pattern
  as `app/api/cron/notify/route.ts`). It runs the SAFE improve pass: name/label cleanup,
  default-variant fix, dedupe of exact source+externalId, and flags (not deletes) the
  implausible/garbled for review. Bounded per run (e.g. 500 foods) so it's cheap.
- Schedule it via a **RedRun workspace schedule** on the become workspace (nightly),
  or the existing cron mechanism — part of the normal `/deploy become` push.
- It writes a small report to a `foodAuditRuns` collection (counts fixed/flagged) so we
  can watch it over time; heavy re-fetch (USDA/OFF) stays in the manual `./reconcile.sh`
  (rate limits), not the nightly job.

## 7. Priority
1. **Phase 1** (names + serving labels) — biggest visible win, safe. Ship + back-fill.
2. **Phase 2** (merge guardrails + default selection) — fixes Tea/Chicken/Coffee defaults.
3. **Nightly cron** (§6) wrapping Phase-1/2 safe passes — keeps it clean going forward.
4. **Phase 3** (ranking) — surfaces the now-clean generics at the top.

## 8. Key files
`lib/usda.ts`, `lib/foodImport.ts`, `lib/foodVariantMerge.ts`, `lib/foodGrouping.ts`,
`lib/foodReview.ts`, `app/api/nutrition/foods/route.ts` (ranking),
`app/api/cron/notify/route.ts` (cron pattern), `scripts/*` (audit/reconcile tooling).
