/**
 * Seed first-class foods (admin-curated essentials) into the Food collection.
 *
 * Idempotent: skips foods whose slug already exists.
 *
 * Run from webapp/:
 *   npx tsx scripts/seed-first-class-foods.ts
 *
 * Reads MONGODB_URI from .env.local, falls back to the local docker compose URI.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import Food, { FoodCategory, IFoodVariant } from '../models/Food'
import { baseSlug } from '../lib/foodSlug'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/become?authSource=admin'

interface SeedFood {
  name: string
  brand?: string
  category: FoodCategory
  aliases?: string[]
  variants: IFoodVariant[]
}

const foods: SeedFood[] = [
  // ── Fruits ──────────────────────────────────────────────────────────────────
  {
    name: 'Banana',
    category: 'Fruit',
    aliases: ['Bananas'],
    variants: [{
      name: 'Raw',
      isDefault: true,
      servingSize: 118,
      servingUnit: 'each',
      alternateServings: [
        { label: '1 medium (118g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 118 },
      ],
      nutrition: { calories: 105, protein: 1.3, carbs: 27, fats: 0.4, fiber: 3.1, sugar: 14.4, sodium: 0.001, saturatedFat: 0.1 },
    }],
  },
  {
    name: 'Apple',
    category: 'Fruit',
    aliases: ['Apples'],
    variants: [{
      name: 'Raw',
      isDefault: true,
      servingSize: 182,
      servingUnit: 'each',
      alternateServings: [
        { label: '1 medium (182g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 182 },
      ],
      nutrition: { calories: 95, protein: 0.5, carbs: 25, fats: 0.3, fiber: 4.4, sugar: 19, sodium: 0.002, saturatedFat: 0.1 },
    }],
  },
  {
    name: 'Blueberries',
    category: 'Fruit',
    variants: [{
      name: 'Raw',
      isDefault: true,
      servingSize: 148,
      servingUnit: 'cup',
      alternateServings: [
        { label: '1 cup (148g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 148 },
      ],
      nutrition: { calories: 84, protein: 1.1, carbs: 21.4, fats: 0.5, fiber: 3.6, sugar: 14.7, sodium: 0.001, saturatedFat: 0 },
    }],
  },
  {
    name: 'Strawberries',
    category: 'Fruit',
    variants: [{
      name: 'Raw',
      isDefault: true,
      servingSize: 152,
      servingUnit: 'cup',
      alternateServings: [
        { label: '1 cup sliced (152g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 152 },
      ],
      nutrition: { calories: 49, protein: 1, carbs: 11.7, fats: 0.5, fiber: 3, sugar: 7.4, sodium: 0.002, saturatedFat: 0 },
    }],
  },
  {
    name: 'Avocado',
    category: 'Fat',
    aliases: ['Avocados'],
    variants: [{
      name: 'Raw',
      isDefault: true,
      servingSize: 100,
      servingUnit: 'g',
      alternateServings: [
        { label: '1/2 avocado (100g)', multiplier: 1 },
        { label: '1 whole avocado (200g)', multiplier: 2 },
      ],
      nutrition: { calories: 160, protein: 2, carbs: 8.5, fats: 14.7, fiber: 6.7, sugar: 0.7, sodium: 0.007, saturatedFat: 2.1 },
    }],
  },

  // ── Eggs (4 variants) ───────────────────────────────────────────────────────
  {
    name: 'Eggs',
    category: 'Protein',
    aliases: ['Egg', 'Chicken egg'],
    variants: [
      {
        name: 'Raw',
        isDefault: true,
        servingSize: 50,
        servingUnit: 'each',
        alternateServings: [{ label: '1 large (50g)', multiplier: 1 }, { label: '100 g', multiplier: 100 / 50 }],
        nutrition: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8, fiber: 0, sugar: 0.2, sodium: 0.071, saturatedFat: 1.6 },
      },
      {
        name: 'Hard-Boiled',
        isDefault: false,
        servingSize: 50,
        servingUnit: 'each',
        alternateServings: [{ label: '1 large (50g)', multiplier: 1 }, { label: '100 g', multiplier: 100 / 50 }],
        nutrition: { calories: 78, protein: 6.3, carbs: 0.6, fats: 5.3, fiber: 0, sugar: 0.6, sodium: 0.062, saturatedFat: 1.6 },
      },
      {
        name: 'Scrambled with butter',
        isDefault: false,
        servingSize: 61,
        servingUnit: 'each',
        alternateServings: [{ label: '1 large (61g)', multiplier: 1 }, { label: '100 g', multiplier: 100 / 61 }],
        nutrition: { calories: 95, protein: 6.7, carbs: 1.1, fats: 7, fiber: 0, sugar: 1.1, sodium: 0.155, saturatedFat: 2.7 },
      },
      {
        name: 'Fried in oil',
        isDefault: false,
        servingSize: 46,
        servingUnit: 'each',
        alternateServings: [{ label: '1 large fried (46g)', multiplier: 1 }, { label: '100 g', multiplier: 100 / 46 }],
        nutrition: { calories: 90, protein: 6.3, carbs: 0.4, fats: 6.8, fiber: 0, sugar: 0.2, sodium: 0.094, saturatedFat: 1.9 },
      },
    ],
  },

  // ── Chicken Breast (3 variants) ─────────────────────────────────────────────
  {
    name: 'Chicken Breast, Skinless Boneless',
    category: 'Protein',
    aliases: ['Chicken breast', 'Boneless chicken breast'],
    variants: [
      {
        name: 'Raw',
        isDefault: false,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [
          { label: '100 g', multiplier: 1 },
          { label: '1 breast (~170g)', multiplier: 1.7 },
        ],
        nutrition: { calories: 120, protein: 22.5, carbs: 0, fats: 2.6, fiber: 0, sugar: 0, sodium: 0.045, saturatedFat: 0.7 },
      },
      {
        name: 'Grilled',
        isDefault: true,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [
          { label: '100 g cooked', multiplier: 1 },
          { label: '4 oz cooked (113g)', multiplier: 1.13 },
        ],
        nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6, fiber: 0, sugar: 0, sodium: 0.074, saturatedFat: 1 },
      },
      {
        name: 'Baked',
        isDefault: false,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [
          { label: '100 g cooked', multiplier: 1 },
          { label: '4 oz cooked (113g)', multiplier: 1.13 },
        ],
        nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6, fiber: 0, sugar: 0, sodium: 0.074, saturatedFat: 1 },
      },
    ],
  },

  // ── Salmon ──────────────────────────────────────────────────────────────────
  {
    name: 'Salmon, Atlantic',
    category: 'Protein',
    aliases: ['Atlantic salmon', 'Salmon'],
    variants: [
      {
        name: 'Raw',
        isDefault: false,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [{ label: '100 g', multiplier: 1 }, { label: '6 oz (170g)', multiplier: 1.7 }],
        nutrition: { calories: 208, protein: 20, carbs: 0, fats: 13.4, fiber: 0, sugar: 0, sodium: 0.059, saturatedFat: 3.1 },
      },
      {
        name: 'Baked/Grilled',
        isDefault: true,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [{ label: '100 g cooked', multiplier: 1 }, { label: '6 oz cooked (170g)', multiplier: 1.7 }],
        nutrition: { calories: 206, protein: 22.1, carbs: 0, fats: 12.4, fiber: 0, sugar: 0, sodium: 0.061, saturatedFat: 3.1 },
      },
    ],
  },

  // ── Ground Beef 85/15 ───────────────────────────────────────────────────────
  {
    name: 'Ground Beef 85/15',
    category: 'Protein',
    aliases: ['85% lean ground beef', 'Lean ground beef'],
    variants: [
      {
        name: 'Raw',
        isDefault: false,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [{ label: '100 g', multiplier: 1 }, { label: '4 oz (113g)', multiplier: 1.13 }],
        nutrition: { calories: 215, protein: 18.6, carbs: 0, fats: 15, fiber: 0, sugar: 0, sodium: 0.066, saturatedFat: 5.9 },
      },
      {
        name: 'Cooked',
        isDefault: true,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [{ label: '100 g cooked', multiplier: 1 }, { label: '4 oz cooked (113g)', multiplier: 1.13 }],
        nutrition: { calories: 250, protein: 26, carbs: 0, fats: 15.5, fiber: 0, sugar: 0, sodium: 0.075, saturatedFat: 6.1 },
      },
    ],
  },

  // ── Greek Yogurt ────────────────────────────────────────────────────────────
  {
    name: 'Greek Yogurt, Plain Nonfat',
    category: 'Dairy',
    aliases: ['Greek yogurt', 'Nonfat Greek yogurt'],
    variants: [{
      name: 'Default',
      isDefault: true,
      servingSize: 170,
      servingUnit: 'each',
      alternateServings: [
        { label: '1 container (170g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 170 },
      ],
      nutrition: { calories: 100, protein: 17, carbs: 6, fats: 0.7, fiber: 0, sugar: 6, sodium: 0.061, saturatedFat: 0.2 },
    }],
  },

  // ── Oats ────────────────────────────────────────────────────────────────────
  {
    name: 'Oats, Rolled',
    category: 'Grain',
    aliases: ['Rolled oats', 'Old-fashioned oats', 'Oatmeal'],
    variants: [
      {
        name: 'Dry',
        isDefault: true,
        servingSize: 40,
        servingUnit: 'g',
        alternateServings: [
          { label: '1/2 cup dry (40g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 40 },
        ],
        nutrition: { calories: 150, protein: 5, carbs: 27, fats: 2.5, fiber: 4, sugar: 1, sodium: 0, saturatedFat: 0.5 },
      },
      {
        name: 'Cooked',
        isDefault: false,
        servingSize: 234,
        servingUnit: 'cup',
        alternateServings: [
          { label: '1 cup cooked (234g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 234 },
        ],
        nutrition: { calories: 158, protein: 5.9, carbs: 27.4, fats: 3.2, fiber: 4, sugar: 1.1, sodium: 0.115, saturatedFat: 0.6 },
      },
    ],
  },

  // ── White Rice ──────────────────────────────────────────────────────────────
  {
    name: 'White Rice',
    category: 'Grain',
    aliases: ['Long grain white rice'],
    variants: [
      {
        name: 'Dry',
        isDefault: false,
        servingSize: 45,
        servingUnit: 'g',
        alternateServings: [
          { label: '1/4 cup dry (45g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 45 },
        ],
        nutrition: { calories: 160, protein: 3, carbs: 36, fats: 0.3, fiber: 0.6, sugar: 0, sodium: 0, saturatedFat: 0.1 },
      },
      {
        name: 'Cooked',
        isDefault: true,
        servingSize: 158,
        servingUnit: 'cup',
        alternateServings: [
          { label: '1 cup cooked (158g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 158 },
        ],
        nutrition: { calories: 205, protein: 4.3, carbs: 44.5, fats: 0.4, fiber: 0.6, sugar: 0.1, sodium: 0.002, saturatedFat: 0.1 },
      },
    ],
  },

  // ── Brown Rice ──────────────────────────────────────────────────────────────
  {
    name: 'Brown Rice',
    category: 'Grain',
    aliases: ['Long grain brown rice'],
    variants: [
      {
        name: 'Dry',
        isDefault: false,
        servingSize: 45,
        servingUnit: 'g',
        alternateServings: [
          { label: '1/4 cup dry (45g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 45 },
        ],
        nutrition: { calories: 160, protein: 3.5, carbs: 33, fats: 1.5, fiber: 1.5, sugar: 0, sodium: 0, saturatedFat: 0.3 },
      },
      {
        name: 'Cooked',
        isDefault: true,
        servingSize: 195,
        servingUnit: 'cup',
        alternateServings: [
          { label: '1 cup cooked (195g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 195 },
        ],
        nutrition: { calories: 215, protein: 5, carbs: 44.8, fats: 1.8, fiber: 3.5, sugar: 0.7, sodium: 0.01, saturatedFat: 0.4 },
      },
    ],
  },

  // ── Sweet Potato ────────────────────────────────────────────────────────────
  {
    name: 'Sweet Potato',
    category: 'Vegetable',
    aliases: ['Sweet potatoes', 'Yam'],
    variants: [
      {
        name: 'Raw',
        isDefault: false,
        servingSize: 130,
        servingUnit: 'each',
        alternateServings: [
          { label: '1 medium (130g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 130 },
        ],
        nutrition: { calories: 113, protein: 2.1, carbs: 26.2, fats: 0.1, fiber: 3.9, sugar: 5.4, sodium: 0.072, saturatedFat: 0 },
      },
      {
        name: 'Baked',
        isDefault: true,
        servingSize: 114,
        servingUnit: 'each',
        alternateServings: [
          { label: '1 medium baked (114g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 114 },
        ],
        nutrition: { calories: 103, protein: 2.3, carbs: 23.6, fats: 0.2, fiber: 3.8, sugar: 7.4, sodium: 0.041, saturatedFat: 0 },
      },
    ],
  },

  // ── Broccoli ────────────────────────────────────────────────────────────────
  {
    name: 'Broccoli',
    category: 'Vegetable',
    variants: [
      {
        name: 'Raw',
        isDefault: false,
        servingSize: 91,
        servingUnit: 'cup',
        alternateServings: [
          { label: '1 cup chopped (91g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 91 },
        ],
        nutrition: { calories: 31, protein: 2.5, carbs: 6, fats: 0.3, fiber: 2.4, sugar: 1.5, sodium: 0.03, saturatedFat: 0 },
      },
      {
        name: 'Steamed',
        isDefault: true,
        servingSize: 156,
        servingUnit: 'cup',
        alternateServings: [
          { label: '1 cup cooked (156g)', multiplier: 1 },
          { label: '100 g', multiplier: 100 / 156 },
        ],
        nutrition: { calories: 55, protein: 3.7, carbs: 11.2, fats: 0.6, fiber: 5.1, sugar: 2.2, sodium: 0.064, saturatedFat: 0.1 },
      },
    ],
  },

  // ── Spinach ─────────────────────────────────────────────────────────────────
  {
    name: 'Spinach',
    category: 'Vegetable',
    variants: [{
      name: 'Raw',
      isDefault: true,
      servingSize: 30,
      servingUnit: 'cup',
      alternateServings: [
        { label: '1 cup (30g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 30 },
      ],
      nutrition: { calories: 7, protein: 0.9, carbs: 1.1, fats: 0.1, fiber: 0.7, sugar: 0.1, sodium: 0.024, saturatedFat: 0 },
    }],
  },

  // ── Almonds ─────────────────────────────────────────────────────────────────
  {
    name: 'Almonds',
    category: 'Fat',
    variants: [{
      name: 'Raw',
      isDefault: true,
      servingSize: 28,
      servingUnit: 'g',
      alternateServings: [
        { label: '1 oz / ~23 nuts (28g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 28 },
      ],
      nutrition: { calories: 164, protein: 6, carbs: 6.1, fats: 14.2, fiber: 3.5, sugar: 1.2, sodium: 0, saturatedFat: 1.1 },
    }],
  },

  // ── Olive Oil ───────────────────────────────────────────────────────────────
  {
    name: 'Olive Oil',
    category: 'Fat',
    aliases: ['Extra virgin olive oil', 'EVOO'],
    variants: [{
      name: 'Default',
      isDefault: true,
      servingSize: 14,
      servingUnit: 'tbsp',
      alternateServings: [
        { label: '1 tbsp (14g)', multiplier: 1 },
        { label: '1 tsp (4.5g)', multiplier: 4.5 / 14 },
        { label: '100 g', multiplier: 100 / 14 },
      ],
      nutrition: { calories: 119, protein: 0, carbs: 0, fats: 13.5, fiber: 0, sugar: 0, sodium: 0.0003, saturatedFat: 1.9 },
    }],
  },

  // ── Whole Wheat Bread ───────────────────────────────────────────────────────
  {
    name: 'Whole Wheat Bread',
    category: 'Grain',
    aliases: ['Wheat bread', 'Whole grain bread'],
    variants: [{
      name: 'Default',
      isDefault: true,
      servingSize: 28,
      servingUnit: 'slice',
      alternateServings: [
        { label: '1 slice (28g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 28 },
      ],
      nutrition: { calories: 70, protein: 3.6, carbs: 12, fats: 1, fiber: 1.9, sugar: 1.4, sodium: 0.135, saturatedFat: 0.2 },
    }],
  },

  // ── Black Beans ─────────────────────────────────────────────────────────────
  {
    name: 'Black Beans, Cooked',
    category: 'Protein',
    aliases: ['Black beans', 'Boiled black beans'],
    variants: [{
      name: 'Cooked',
      isDefault: true,
      servingSize: 172,
      servingUnit: 'cup',
      alternateServings: [
        { label: '1 cup (172g)', multiplier: 1 },
        { label: '100 g', multiplier: 100 / 172 },
      ],
      nutrition: { calories: 227, protein: 15.2, carbs: 40.8, fats: 0.9, fiber: 15, sugar: 0.6, sodium: 0.002, saturatedFat: 0.2 },
    }],
  },
]

async function seed() {
  console.log('Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('Connected.')

  let inserted = 0
  let skipped = 0

  for (const food of foods) {
    const slug = baseSlug(food.name, food.brand)
    const existing = await Food.findOne({ slug })
    if (existing) {
      console.log(`  · skip (slug exists): ${food.name} → ${slug}`)
      skipped++
      continue
    }

    await Food.create({
      name: food.name,
      slug,
      brand: food.brand,
      category: food.category,
      variants: food.variants,
      aliases: food.aliases ?? [],
      source: 'manual',
      isFirstClass: true,
      isVerified: true,
      usageCount: 0,
    })
    console.log(`  + ${food.name}  (${food.variants.length} variant${food.variants.length === 1 ? '' : 's'})`)
    inserted++
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`)
  await mongoose.disconnect()
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
