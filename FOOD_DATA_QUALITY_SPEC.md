# Food Data Quality / Catalog Hygiene — Spec for Pickup

> **Status:** OPEN — ready for an agent to pick up.
> **Authored:** 2026-06-25, by the Become agent (handoff; prior session ran out of tokens).
> **Assumption (correct me if wrong):** "this food data issue" = the underlying
> **food-catalog data quality** problem that the last commit
> (`0d73e95 fix(nutrition): overhaul food search quality`) only papered over with
> hardcoded ranking penalties. If the intended issue was something narrower
> (a single bad record, a specific user report), re-scope to that — but the
> investigation below stands regardless.

---

## 1. The problem in one sentence

Our Food catalog is silently polluted by **automatic background imports** of every
external USDA/OFF result a user ever sees, and search quality is currently held
together by **hardcoded keyword penalties** rather than by the data being clean.
Each new garbage query class (tallow for "beef", frankfurters for "beef",
Impossible Steak Bites for "steak") requires another regex patch instead of a
data fix that generalizes.

## 2. Why this matters now

The 2026-06-25 search overhaul (`webapp/app/api/nutrition/foods/route.ts`) added:
- `isFirstClass` −500 boost so curated foods always win,
- `irrelevancePenalty()` — `+150–300` for animal-fat/tallow, plant-based
  impersonators, processed-meat products,
- extra `QUALIFIER_PATTERN` words.

This works **only for the query/food classes we hand-enumerated.** It does not
scale: the catalog keeps absorbing low-quality records via the `after()`
background auto-import (route.ts:499–512, `backgroundImportExternals`), so the
junk pool grows on every search while the ranking layer plays whack-a-mole.

## 3. Root causes (already diagnosed; see memory + git history)

1. **Unbounded background auto-import.** Every external result returned to the
   client is persisted async (route.ts:499–512). There is no quality gate — junk
   OFF rows (garbled names, missing/implausible macros) and redundant USDA rows
   become permanent Food docs.
2. **Mis-shaped serving data on import** — root-caused & largely fixed
   2026-06-23 (`migrate-fix-firstclass-servings.ts`, `lib/units.ts`
   `convertWithBridge` 240× bug). See `project_food_serving_shape_bug` memory.
   But the *import paths* (`lib/foodImport.ts`) can still introduce bad shapes
   for non-first-class foods.
3. **OFF macro extraction is lossy** — `mapOffToFoodResult` (route.ts:60–115)
   and `extractGramsFromOffServing` punt on volume/discrete units; OFF records
   with bad/empty `serving_size` yield near-zero or wrong per-serving math.
4. **No dedup at the data layer** — dedup happens at *query time*
   (`lib/foodSearchDedupe.ts`, `lib/usdaSynthMerge.ts`), not in the stored
   catalog, so the same food persists many times under different external ids.

## 4. Known concrete defects to clean up (from the 2026-06-23/24 audit)

These were filed as "recommend, not yet fixed — need a product call" and are
still open:

- **Junk record to delete:** garbled `"WARTS PEPSI…"` OFF import,
  `_id 6a3b3f7aff7e93c00c7d14b1`.
- **Dangling refs on Food DELETE:** old `MealLog`s keep a `foodId` that 404s on
  re-fetch (snapshots keep nutrition safe, but the link rots).
- **Synthetic ids leak:** barcode "not found" can return a synthetic `off-<code>`
  id that has no real backing record.
- **Off-macro foods:** some imported foods have wrong per-100g macros;
  `reimport-off-macros.ts` / `fix-food-nutrition.ts` exist to correct them but
  no systematic sweep has been run.
- **No AI request-timeout UX past ~30s** (tangential, nutrition AI seam).

## 5. Existing tooling (use these — do not rebuild)

All in `webapp/scripts/`, read-only unless `--apply` / `--flag` / `--clear-legit`:

| Script | Purpose |
|---|---|
| `audit-empty-foods.ts` | legit-near-zero classifier; `--clear-legit`, `--flag` |
| `diagnose-food-logging.ts` | simulates picker math catalog-wide (catches serving-shape breakage that a default-serving check misses) |
| `inspect-food.ts` | owner lookup by name |
| `reimport-off-macros.ts` | live OFF re-fetch (rate-limit hardened) |
| `fix-food-nutrition.ts` | web/USDA per-100g corrections, keyed by `_id` |
| `migrate-fix-firstclass-servings.ts` | the serving-shape migration (idempotent) |
| `seed-first-class-foods.ts` | curated staples (34 in prod); normalizes servings at insert |
| `cleanup-dangling-savedFoods.ts` | precedent for a dangling-ref sweep |

**DB access:** production is **MongoDB Atlas** (not the LAN server) — see the
`reference_database` memory for the URI source. Scripts read `MONGODB_URI`.
Always dry-run first; the catalog is shared/production.

## 6. Proposed scope for the pickup agent

Recommend tackling in this order (each is independently shippable):

**Phase A — Stop the bleeding (highest value):**
- Add a **quality gate to `backgroundImportExternals`** (route.ts:554) /
  `lib/foodImport.ts` so junk never persists: reject records with implausible
  macros (e.g. `calories===0 && protein===0 && carbs===0 && fats===0`, or
  energy wildly inconsistent with macros), empty/garbled names (non-alpha
  ratio, ALL-CAPS-no-vowels), or missing a usable serving basis.
- Apply the same `irrelevancePenalty` *classes* (tallow/impossible/frankfurter)
  as an **import-time downrank or skip**, so ranking stops being the only
  defense. Consider moving these patterns into a shared
  `lib/nutrition/foodQuality.ts` used by BOTH import and search (single source
  of truth).

**Phase B — Clean existing pollution (one-time sweep):**
- Write/extend an audit script that flags: zero-macro foods (excluding the
  legit-near-zero set), garbled names, and duplicate externalIds.
- Delete the known `WARTS PEPSI` record and any cohort it surfaces.
- Run `reimport-off-macros.ts` / `fix-food-nutrition.ts` over flagged off-macro
  foods.

**Phase C — Structural fixes (needs a product call):**
- Decide Food DELETE policy (soft-delete / tombstone vs. hard delete + MealLog
  snapshot reliance) to kill dangling refs.
- Suppress synthetic `off-<code>` ids when there's no real backing record.

## 7. Verification (do not skip — per project norms)

- `cd webapp && npm run build` MUST pass (route.ts is a Next.js handler — only
  `next build`, not `tsc`, catches bad exports; see
  `feedback_next_route_exports` memory).
- Run `diagnose-food-logging.ts` before/after to prove no first-class food
  regressed to unloggable.
- For each search class fixed, confirm the offending result is gone for the bare
  query AND still returned when the user explicitly asks for it (e.g. "beef
  tallow" must still return tallow).
- Site check `curl https://become.redbtn.io/` before any Playwright pass.
- Deploy via **RedRun** (`/deploy become`), NOT Firebase. Workspace
  `69ab83dd21070736089dc29d`.

## 8. Key files

- `webapp/app/api/nutrition/foods/route.ts` — search ranking + background import
- `webapp/lib/foodImport.ts` — `importFromUSDA` / `importFromOpenFoodFacts` / `importManualFood`
- `webapp/lib/units.ts` — `convertWithBridge`, `parseQuantityString`, `convert`
- `webapp/lib/foodSearchDedupe.ts`, `webapp/lib/usdaSynthMerge.ts` — query-time dedup
- `webapp/lib/nutrition/foodMatch.ts` — `stemMatch`
- `webapp/models/Food.ts`, `webapp/models/OpenFoodFact.ts`
- `webapp/scripts/*` — tooling table above

## 9. Related memory (read before starting)

`project_logging_audit`, `project_food_serving_shape_bug`, `project_food_search`,
`project_nutrition_architecture`, `project_ai_portion_rework`, `reference_database`,
`feedback_nutrition_ux` (simplicity is the goal — fewer, better choices),
`feedback_deployment`, `feedback_next_route_exports`.
