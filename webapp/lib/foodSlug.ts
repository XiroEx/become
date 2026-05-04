import type { Model } from 'mongoose'
import type { IFood } from '@/models/Food'

/**
 * Build a base slug from a food name + optional brand.
 * Lowercase, hyphenated, alphanumeric only. Strips diacritics.
 */
export function baseSlug(name: string, brand?: string): string {
  const raw = brand ? `${brand} ${name}` : name
  const ascii = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'food'
}

/**
 * Generate a slug guaranteed unique against the Food collection.
 * Appends -2, -3, ... when collisions exist.
 */
export async function generateUniqueFoodSlug(
  FoodModel: Model<IFood>,
  name: string,
  brand?: string,
): Promise<string> {
  const base = baseSlug(name, brand)
  let candidate = base
  let n = 2
  // Tight limit so we don't loop forever in pathological cases
  while (n < 1000) {
    const exists = await FoodModel.exists({ slug: candidate })
    if (!exists) return candidate
    candidate = `${base}-${n}`
    n += 1
  }
  // Fallback — extremely unlikely
  return `${base}-${Date.now()}`
}
