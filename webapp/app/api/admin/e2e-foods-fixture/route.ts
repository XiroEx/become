/**
 * E2E fixture endpoint for admin food-detail scaling tests.
 *
 * Seeds and tears down a multi-variant Food doc used to verify the admin
 * detail page's pagination + filter behavior. Gated by the same
 * x-bootstrap-token as the other /api/admin/e2e-* helpers so it never
 * fires accidentally outside the test suite.
 *
 * POST   → creates a Food with the requested variant count (default 60)
 *          and returns { foodId }. The Food is marked source='manual'
 *          with a unique groupKey so it never collides with real data.
 * DELETE → removes the fixture by foodId (passed as ?foodId=…).
 */

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import Food from '@/models/Food'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

async function unauthorized(req: NextRequest): Promise<NextResponse | null> {
  const { admin } = await getRuntimeConfig()
  if (!admin.bootstrapToken || req.headers.get('x-bootstrap-token') !== admin.bootstrapToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const reject = await unauthorized(req)
  if (reject) return reject

  try {
    await connectDB()
    const { variantCount = 60 } = await req.json().catch(() => ({})) as { variantCount?: number }
    const count = Math.max(1, Math.min(200, variantCount))

    const groupKey = `e2e-scaling-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const slug = `e2e-scaling-fixture-${Date.now()}`

    const variants = Array.from({ length: count }, (_, i) => {
      const n = (i + 1).toString().padStart(2, '0')
      return {
        _id: new mongoose.Types.ObjectId(),
        name: `Variant ${n}`,
        isDefault: i === 0,
        servingSize: 100,
        servingUnit: 'g',
        alternateServings: [],
        externalId: `E2E-FDC-${1000 + i}`,
        externalDataType: i % 2 === 0 ? 'Foundation' : 'Branded',
        nutrition: { calories: 50 + i, protein: 5, carbs: 5, fats: 1 },
      }
    })

    const food = await Food.create({
      name: 'E2E Scaling Fixture',
      slug,
      category: 'Other',
      variants,
      aliases: [],
      source: 'manual',
      isFirstClass: false,
      isVerified: false,
      usageCount: 0,
      groupKey,
    })

    return NextResponse.json({ foodId: String(food._id), groupKey, variantCount: count })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to seed fixture' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  const reject = await unauthorized(req)
  if (reject) return reject

  try {
    await connectDB()
    const { searchParams } = new URL(req.url)
    const foodId = searchParams.get('foodId')
    if (!foodId) {
      return NextResponse.json({ error: 'foodId query param required' }, { status: 400 })
    }
    const result = await Food.deleteOne({ _id: new mongoose.Types.ObjectId(foodId) })
    return NextResponse.json({ deleted: result.deletedCount })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete fixture' },
      { status: 500 },
    )
  }
}
