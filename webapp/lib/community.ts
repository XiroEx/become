import mongoose from 'mongoose'

export function slugifyCommunityName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12)
  }
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12)
}

export function objectIdFrom(value: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const normalized = slugifyCommunityName(base) || new mongoose.Types.ObjectId().toString()
  let slug = normalized
  let i = 2
  while (await exists(slug)) {
    slug = `${normalized}-${i}`
    i += 1
  }
  return slug
}
