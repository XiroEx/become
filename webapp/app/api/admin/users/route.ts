import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import { verifyAdmin } from '@/lib/adminAuth'

export async function GET(request: NextRequest) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 }
      )
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const search = searchParams.get('search') ?? ''
    const roleFilter = searchParams.get('role') ?? ''

    // Build user match filter
    const matchFilter: Record<string, unknown> = {}
    if (search) {
      const regex = { $regex: search, $options: 'i' }
      matchFilter.$or = [{ name: regex }, { email: regex }]
    }
    if (roleFilter && ['user', 'trainer', 'admin'].includes(roleFilter)) {
      matchFilter.role = roleFilter
    }

    const skip = (page - 1) * limit

    // Aggregate users with progress data
    const [result] = await User.aggregate([
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          users: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'userprogresses',
                let: { userId: '$_id' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
                  {
                    $project: {
                      totalWorkouts: 1,
                      streakDays: 1,
                      lastActivityDate: 1,
                    },
                  },
                ],
                as: 'progress',
              },
            },
            {
              $project: {
                password: 0,
              },
            },
          ],
        },
      },
    ])

    const total = result.total[0]?.count ?? 0
    const pages = Math.ceil(total / limit)

    const users = (result.users as Array<Record<string, unknown> & { progress?: Array<{ totalWorkouts?: number; streakDays?: number; lastActivityDate?: Date }> }>).map((u) => {
      const progress = u.progress?.[0]
      const { progress: _progress, ...rest } = u
      void _progress
      return {
        ...rest,
        totalWorkouts: progress?.totalWorkouts ?? 0,
        streakDays: progress?.streakDays ?? 0,
        lastActivityDate: progress?.lastActivityDate ?? null,
      }
    })

    return NextResponse.json({ users, total, page, pages })
  } catch (error) {
    console.error('Admin users list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
