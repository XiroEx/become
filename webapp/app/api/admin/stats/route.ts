import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
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

    const now = new Date()
    const startOfThisWeek = new Date(now)
    startOfThisWeek.setDate(now.getDate() - now.getDay())
    startOfThisWeek.setHours(0, 0, 0, 0)

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    // --- User stats ---
    const [
      totalUsers,
      newThisWeek,
      newThisMonth,
      byRoleResult,
      onboardingCompleted,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfThisWeek } }),
      User.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      User.countDocuments({ onboardingCompleted: true }),
    ])

    const byRole: { user: number; trainer: number; admin: number } = {
      user: 0,
      trainer: 0,
      admin: 0,
    }
    for (const r of byRoleResult as Array<{ _id: string; count: number }>) {
      if (r._id === 'user' || r._id === 'trainer' || r._id === 'admin') {
        byRole[r._id] = r.count
      }
    }

    // --- Activity stats ---
    const [activityResult] = await UserProgress.aggregate([
      {
        $group: {
          _id: null,
          totalWorkoutsLogged: { $sum: '$totalWorkouts' },
          avgStreakDays: { $avg: '$streakDays' },
          topStreak: { $max: '$longestStreak' },
        },
      },
    ])

    const activeThisWeek = await UserProgress.countDocuments({
      lastActivityDate: { $gte: startOfThisWeek },
    })
    const activeThisMonth = await UserProgress.countDocuments({
      lastActivityDate: { $gte: startOfThisMonth },
    })

    // --- Workouts by day (last 30 days) ---
    const workoutsByDayResult = await UserProgress.aggregate([
      {
        $project: {
          workoutLogs: {
            $filter: {
              input: '$workoutLogs',
              as: 'log',
              cond: { $gte: ['$$log.date', thirtyDaysAgo] },
            },
          },
        },
      },
      { $unwind: '$workoutLogs' },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$workoutLogs.date' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ])

    // --- Mood average (last 30 days) ---
    const moodAggResult = await UserProgress.aggregate([
      {
        $project: {
          moodHistory: {
            $filter: {
              input: '$moodHistory',
              as: 'entry',
              cond: { $gte: ['$$entry.date', thirtyDaysAgo] },
            },
          },
        },
      },
      { $unwind: '$moodHistory' },
      {
        $group: {
          _id: null,
          avgMood: { $avg: '$moodHistory.mood' },
        },
      },
    ])

    const moodAvg: number | null =
      moodAggResult.length > 0 && moodAggResult[0].avgMood != null
        ? Math.round(moodAggResult[0].avgMood * 100) / 100
        : null

    return NextResponse.json({
      users: {
        total: totalUsers,
        newThisWeek,
        newThisMonth,
        byRole,
        onboardingCompleted,
      },
      activity: {
        totalWorkoutsLogged: activityResult?.totalWorkoutsLogged ?? 0,
        activeThisWeek,
        activeThisMonth,
        avgStreakDays:
          activityResult?.avgStreakDays != null
            ? Math.round(activityResult.avgStreakDays * 10) / 10
            : 0,
        topStreak: activityResult?.topStreak ?? 0,
      },
      workoutsByDay: workoutsByDayResult as Array<{ date: string; count: number }>,
      moodAvg,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
