/**
 * Migration: NutritionLog.meals[] → MealLog documents.
 *
 * Idempotent. For every meal in every NutritionLog we ensure exactly one
 * MealLog exists for the user+loggedAt+primary-tag combo. If we find one
 * already there, we skip. We do NOT delete NutritionLog.meals[] yet — that
 * happens in Phase 2B once the frontend cuts over.
 *
 * Run with:
 *   DEV:  npx tsx scripts/migrate-nutrition-log-to-meal-log.ts
 *   PROD: npx tsx scripts/migrate-nutrition-log-to-meal-log.ts --prod
 */

import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

const PROD_MONGODB_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_MONGODB_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_MONGODB_URI : DEV_MONGODB_URI

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found')
  process.exit(1)
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

const DEFAULT_TIMES: Record<MealType, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 0],
  dinner: [18, 30],
  snack: [15, 0],
}

interface LegacyFood {
  id?: string
  foodId?: mongoose.Types.ObjectId | string
  variantId?: mongoose.Types.ObjectId | string
  variantName?: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  servings: number
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
}

interface LegacyMeal {
  id?: string
  mealType: MealType
  foods: LegacyFood[]
  loggedAt?: Date
}

interface LegacyNutritionLog {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  date: Date
  meals?: LegacyMeal[]
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function loggedAtFor(date: Date, mealType: MealType): Date {
  const [h, m] = DEFAULT_TIMES[mealType] ?? [12, 0]
  const out = new Date(date)
  out.setUTCHours(h, m, 0, 0)
  return out
}

function computeTotals(items: LegacyFood[]) {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    saturatedFat: 0,
  }
  for (const item of items) {
    const s = item.servings ?? 1
    const n = item.nutrition
    totals.calories += (n.calories ?? 0) * s
    totals.protein  += (n.protein  ?? 0) * s
    totals.carbs    += (n.carbs    ?? 0) * s
    totals.fats     += (n.fats     ?? 0) * s
    totals.fiber        += (n.fiber        ?? 0) * s
    totals.sugar        += (n.sugar        ?? 0) * s
    totals.sodium       += (n.sodium       ?? 0) * s
    totals.saturatedFat += (n.saturatedFat ?? 0) * s
  }
  totals.calories = Math.round(totals.calories * 10) / 10
  totals.protein  = Math.round(totals.protein  * 10) / 10
  totals.carbs    = Math.round(totals.carbs    * 10) / 10
  totals.fats     = Math.round(totals.fats     * 10) / 10
  totals.fiber        = Math.round(totals.fiber        * 10) / 10
  totals.sugar        = Math.round(totals.sugar        * 10) / 10
  totals.sodium       = Math.round(totals.sodium       * 1000) / 1000
  totals.saturatedFat = Math.round(totals.saturatedFat * 10) / 10
  return totals
}

async function migrate() {
  console.log(`Running migration on ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} database`)
  if (isProd) {
    console.log('WARNING: about to modify the PRODUCTION database!')
    console.log('Press Ctrl+C within 3 seconds to cancel...')
    await delay(3000)
  }

  console.log('Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI as string)
  console.log('Connected.')

  const db = mongoose.connection.db
  if (!db) {
    console.error('Database connection not established')
    process.exit(1)
  }

  const nutritionLogs = db.collection<LegacyNutritionLog>('nutritionlogs')
  const mealLogs = db.collection('meallogs')

  let scanned = 0
  let mealsScanned = 0
  let created = 0
  let skipped = 0
  let emptyMeals = 0

  const cursor = nutritionLogs.find({})
  for await (const doc of cursor) {
    scanned++
    const meals = Array.isArray(doc.meals) ? doc.meals : []
    for (const meal of meals) {
      mealsScanned++
      if (!meal || !Array.isArray(meal.foods) || meal.foods.length === 0) {
        emptyMeals++
        continue
      }

      const mealType: MealType = (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).includes(meal.mealType)
        ? meal.mealType
        : 'snack'

      const loggedAt = meal.loggedAt ? new Date(meal.loggedAt) : loggedAtFor(doc.date, mealType)

      // Idempotency check: any existing MealLog for the same user+day+tag?
      const dayStart = new Date(doc.date)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setUTCHours(23, 59, 59, 999)

      const existing = await mealLogs.findOne({
        user: doc.userId,
        tags: mealType,
        loggedAt: { $gte: dayStart, $lte: dayEnd },
      })
      if (existing) {
        skipped++
        continue
      }

      const items = meal.foods.map(f => ({
        _id: new mongoose.Types.ObjectId(),
        foodId: f.foodId ? new mongoose.Types.ObjectId(String(f.foodId)) : undefined,
        variantId: f.variantId ? new mongoose.Types.ObjectId(String(f.variantId)) : undefined,
        variantName: f.variantName,
        name: f.name,
        brand: f.brand,
        servingSize: f.servingSize,
        servingUnit: f.servingUnit,
        servings: f.servings ?? 1,
        nutrition: {
          calories: f.nutrition?.calories ?? 0,
          protein: f.nutrition?.protein ?? 0,
          carbs: f.nutrition?.carbs ?? 0,
          fats: f.nutrition?.fats ?? 0,
          fiber: f.nutrition?.fiber,
          sugar: f.nutrition?.sugar,
          sodium: f.nutrition?.sodium,
          saturatedFat: f.nutrition?.saturatedFat,
        },
      }))

      const totalNutrition = computeTotals(meal.foods)
      const now = new Date()

      await mealLogs.insertOne({
        user: doc.userId,
        loggedAt,
        items,
        tags: [mealType],
        totalNutrition,
        createdAt: now,
        updatedAt: now,
      })
      created++
    }
  }

  console.log('\nMigration complete.')
  console.log(`  NutritionLogs scanned: ${scanned}`)
  console.log(`  Meals scanned:         ${mealsScanned}`)
  console.log(`  Empty meals skipped:   ${emptyMeals}`)
  console.log(`  MealLogs created:      ${created}`)
  console.log(`  Already existed (skipped): ${skipped}`)

  await mongoose.disconnect()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
