/**
 * Backfill: consolidate pre-existing USDA non-Branded Foods into one parent
 * per `groupKey`, moving each into the parent as a variant.
 *
 * Why: importFromUSDA now merges same-groupKey USDA Foundation/SR Legacy
 * imports into one Food doc. Older imports happened pre-merge so they're
 * scattered as 30+ separate docs ("Tea, hot, herbal", "Tea, iced, bottled",
 * etc.). This script picks a primary per group and pulls the rest in.
 *
 * Algorithm:
 *   1. Find all USDA non-Branded Foods grouped by groupKey.
 *   2. For each group with >= 2 foods, pick a primary:
 *        - lowest fdcId, OR
 *        - one with most variants if tied (deterministic).
 *   3. Move every other food's variants onto the primary, preserving each
 *      variant's externalId/externalDataType/etc., and pushing the original
 *      full descriptions to aliases.
 *   4. Cap at 12 variants. Overflow stays standalone (skipped).
 *   5. After successful merge, deleteOne the source food.
 *   6. Skip groups where any food has isVerified === true.
 *   7. Print summary.
 *
 * Idempotent — re-running after the first pass will skip already-consolidated
 * groups (they'll have only one food per groupKey).
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/merge-existing-variants.ts
 *   PROD: npx tsx scripts/merge-existing-variants.ts --prod
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

const MAX_VARIANTS_PER_FOOD = 12
const MAX_ALIASES = 30

// Title-case a groupKey for display ("chicken breast" → "Chicken Breast").
// Inlined here so the script runs without pulling the Next.js TS aliases.
function prettifyGroupKey(groupKey: string): string {
  if (!groupKey) return ''
  return groupKey
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

interface FoodDoc {
  _id: mongoose.Types.ObjectId
  name: string
  slug: string
  brand?: string
  category?: string
  variants: Array<{
    _id?: mongoose.Types.ObjectId
    name: string
    isDefault: boolean
    servingSize: number
    servingUnit: string
    displayLabel?: string
    alternateServings?: { label: string; multiplier: number }[]
    nutrition: {
      calories: number
      protein: number
      carbs: number
      fats: number
      fiber?: number
      sugar?: number
      sodium?: number
      saturatedFat?: number
    }
    gramsPerServing?: number
    mlPerServing?: number
    externalId?: string
    externalDataType?: string
  }>
  aliases?: string[]
  source: string
  externalId?: string
  externalDataType?: string
  isVerified?: boolean
  isFirstClass?: boolean
  groupKey?: string
}

async function main() {
  console.log(`[merge-existing-variants] connecting to ${isProd ? 'PROD' : 'DEV'}...`)
  await mongoose.connect(MONGODB_URI as string)

  const Food = mongoose.connection.collection<FoodDoc>('foods')

  // Fetch all USDA non-Branded foods that have a groupKey.
  const all = await Food.find({
    source: 'usda',
    externalDataType: { $ne: 'Branded' },
    groupKey: { $exists: true, $ne: '' },
  }).toArray()

  console.log(`[merge-existing-variants] scanning ${all.length} USDA non-Branded foods`)

  // Group by groupKey.
  const byGroup = new Map<string, FoodDoc[]>()
  for (const f of all) {
    const key = f.groupKey
    if (!key || key.length < 2) continue
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(f)
  }

  let scanned = 0
  let groupsMerged = 0
  let variantsMoved = 0
  let foodsDeleted = 0
  let groupsSkippedVerified = 0
  let groupsSkippedSingleton = 0
  let groupsSkippedCapped = 0

  for (const [groupKey, foods] of byGroup.entries()) {
    scanned += foods.length
    if (foods.length < 2) {
      groupsSkippedSingleton++
      continue
    }
    if (foods.some(f => f.isVerified === true)) {
      groupsSkippedVerified++
      continue
    }

    // Pick primary: lowest fdcId, then most variants as tiebreaker.
    const sorted = [...foods].sort((a, b) => {
      const aId = parseInt(a.externalId ?? '0', 10) || 0
      const bId = parseInt(b.externalId ?? '0', 10) || 0
      if (aId !== bId) return aId - bId
      return (b.variants?.length ?? 0) - (a.variants?.length ?? 0)
    })

    const primary = sorted[0]
    const rest = sorted.slice(1)

    // Build the merged variant list. Stamp each existing variant with its
    // own externalId/externalDataType when it doesn't already have one.
    // Primary's existing variants keep their isDefault flag; all moved
    // variants are pushed with isDefault=false so the primary's default
    // stays default.
    const mergedVariants = primary.variants.map(v => ({
      ...v,
      // The primary's own variant(s) — if they have no externalId yet, the
      // primary's top-level externalId fills the slot for the first/default
      // one (so post-merge re-imports of the primary's fdcId still find it).
      externalId: v.externalId
        ?? (v.isDefault ? primary.externalId : undefined),
      externalDataType: v.externalDataType
        ?? (v.isDefault ? primary.externalDataType : undefined),
    }))

    const aliases = [...(primary.aliases ?? [])]
    const aliasesLower = new Set(aliases.map(a => a.toLowerCase()))
    const pushAlias = (s?: string) => {
      const t = (s ?? '').trim()
      if (!t) return
      if (aliasesLower.has(t.toLowerCase())) return
      aliases.push(t)
      aliasesLower.add(t.toLowerCase())
    }

    const existingNames = new Set(mergedVariants.map(v => v.name.toLowerCase()))
    const dedupeName = (n: string): string => {
      if (!existingNames.has(n.toLowerCase())) return n
      for (let i = 2; i < 100; i++) {
        const next = `${n} (${i})`
        if (!existingNames.has(next.toLowerCase())) return next
      }
      return `${n} (${Date.now() % 10000})`
    }

    let moved = 0
    let cappedHere = false
    const deletedSourceIds: mongoose.Types.ObjectId[] = []

    for (const src of rest) {
      if (mergedVariants.length >= MAX_VARIANTS_PER_FOOD) {
        cappedHere = true
        break
      }
      // For each src variant, build a moved copy. The primary one gets its
      // top-level externalId stamped on if it lacks a variant.externalId.
      for (let i = 0; i < src.variants.length; i++) {
        if (mergedVariants.length >= MAX_VARIANTS_PER_FOOD) {
          cappedHere = true
          break
        }
        const sv = src.variants[i]
        const isPrimaryOfSrc = sv.isDefault && !sv.externalId
        const externalId = sv.externalId ?? (isPrimaryOfSrc ? src.externalId : undefined)
        const externalDataType = sv.externalDataType
          ?? (isPrimaryOfSrc ? src.externalDataType : undefined)

        const candidateName = dedupeName(sv.name)
        existingNames.add(candidateName.toLowerCase())

        mergedVariants.push({
          name: candidateName,
          isDefault: false,
          servingSize: sv.servingSize,
          servingUnit: sv.servingUnit,
          displayLabel: sv.displayLabel,
          alternateServings: sv.alternateServings ?? [],
          nutrition: sv.nutrition,
          gramsPerServing: sv.gramsPerServing,
          mlPerServing: sv.mlPerServing,
          externalId,
          externalDataType,
        })
        moved++
      }
      if (cappedHere) break
      // Push aliases from the merged source.
      pushAlias(src.name)
      for (const a of src.aliases ?? []) pushAlias(a)
      deletedSourceIds.push(src._id)
    }

    if (cappedHere) {
      groupsSkippedCapped++
    }

    if (deletedSourceIds.length === 0) {
      // Nothing actually got merged (e.g. cap was hit on the first source).
      continue
    }

    // Decide if the primary should be renamed. The primary's name still
    // looks "USDA-y" (contains a comma) → switch to the prettified
    // groupKey.
    let newName: string | undefined
    const lowerName = primary.name.toLowerCase().trim()
    const prettified = prettifyGroupKey(groupKey)
    const looksRenamedAlready = lowerName === prettified.toLowerCase() || !lowerName.includes(',')
    if (!looksRenamedAlready && prettified) {
      newName = prettified
      pushAlias(primary.name)
    }

    // Cap aliases.
    while (aliases.length > MAX_ALIASES) aliases.shift()

    // Build the update.
    const update: Record<string, unknown> = {
      variants: mergedVariants,
      aliases,
    }
    if (newName) update.name = newName

    await Food.updateOne({ _id: primary._id }, { $set: update })

    // Delete the merged source foods.
    if (deletedSourceIds.length > 0) {
      const result = await Food.deleteMany({ _id: { $in: deletedSourceIds } })
      foodsDeleted += result.deletedCount ?? 0
    }

    variantsMoved += moved
    groupsMerged++
  }

  console.log(`[merge-existing-variants] summary:`)
  console.log(`  scanned: ${scanned}`)
  console.log(`  total groupKeys: ${byGroup.size}`)
  console.log(`  groups merged: ${groupsMerged}`)
  console.log(`  variants moved: ${variantsMoved}`)
  console.log(`  source foods deleted: ${foodsDeleted}`)
  console.log(`  groups skipped (singleton): ${groupsSkippedSingleton}`)
  console.log(`  groups skipped (verified parent): ${groupsSkippedVerified}`)
  console.log(`  groups partially skipped (cap): ${groupsSkippedCapped}`)

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('[merge-existing-variants] failed:', err)
  try { await mongoose.disconnect() } catch { /* ignore */ }
  process.exit(1)
})
