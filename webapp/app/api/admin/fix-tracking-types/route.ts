import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import mongoose from 'mongoose'

const UPDATES = [
  { slug: 'treadmill-interval-run', trackingType: 'intervals' },
  { slug: 'treadmill-zone-2-run',   trackingType: 'time_distance' },
  { slug: 'treadmill-run',          trackingType: 'time_distance' },
  { slug: 'dead-hang',              trackingType: 'time' },
  { slug: 'stair-climb',            trackingType: 'time' },
  { slug: 'easy-jog',               trackingType: 'time_distance' },
  { slug: 'mobility-flow',          trackingType: 'none' },
]

export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key')
    const secret = process.env.JWT_SECRET

    if (!secret || adminKey !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    const col = mongoose.connection.db!.collection('exercises')

    const results: Array<{ slug: string; trackingType: string; matched: number; modified: number }> = []
    let totalModified = 0

    for (const u of UPDATES) {
      const result = await col.updateOne(
        { slug: u.slug },
        { $set: { trackingType: u.trackingType } }
      )
      results.push({
        slug: u.slug,
        trackingType: u.trackingType,
        matched: result.matchedCount,
        modified: result.modifiedCount,
      })
      totalModified += result.modifiedCount
    }

    return NextResponse.json({ totalModified, results })
  } catch (error) {
    console.error('[fix-tracking-types] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
