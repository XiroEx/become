import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import MindProgress from '@/models/MindProgress'
import { verifyAdmin } from '@/lib/adminAuth'
import { readTzOffset, localDateKey, localDayWindowForKey, utcMidnightDateKey } from '@/lib/dayWindow'

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

    const tz = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tz)
    const { start: todayStart } = localDayWindowForKey(todayKey, tz)

    // Start of this week (Sunday) in user's local zone
    const [ty, tm, td] = todayKey.split('-').map(Number)
    const todayDow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() // 0=Sun
    const sundayKey = (() => {
      const d = new Date(Date.UTC(ty, tm - 1, td - todayDow))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    })()
    const { start: startOfThisWeek } = localDayWindowForKey(sundayKey, tz)

    const startOfThisMonth = new Date(Date.UTC(ty, tm - 1, 1))

    // 30 days ago: UTC midnight of (todayKey minus 30 days)
    const thirtyDaysAgoDate = new Date(todayStart)
    thirtyDaysAgoDate.setUTCDate(thirtyDaysAgoDate.getUTCDate() - 30)
    const thirtyDaysAgoKey = `${thirtyDaysAgoDate.getUTCFullYear()}-${String(thirtyDaysAgoDate.getUTCMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgoDate.getUTCDate()).padStart(2, '0')}`
    const thirtyDaysAgo = utcMidnightDateKey(thirtyDaysAgoKey)

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

    // --- Mind progression stats ---
    const [mindAgg] = await MindProgress.aggregate([
      {
        $group: {
          _id: null,
          totalWithMind: { $sum: 1 },
          avgChapter: { $avg: '$chapter' },
          avgXp: { $avg: '$xp' },
          engaged: { $sum: { $cond: [{ $gt: ['$xp', 0] }, 1, 0] } },
          visionCompleted: {
            $sum: { $cond: [{ $ifNull: ['$vision.completedAt', false] }, 1, 0] },
          },
          ch1: { $sum: { $cond: [{ $eq: ['$chapter', 1] }, 1, 0] } },
          ch2: { $sum: { $cond: [{ $eq: ['$chapter', 2] }, 1, 0] } },
          ch3: { $sum: { $cond: [{ $eq: ['$chapter', 3] }, 1, 0] } },
          ch4: { $sum: { $cond: [{ $eq: ['$chapter', 4] }, 1, 0] } },
          ch5: { $sum: { $cond: [{ $eq: ['$chapter', 5] }, 1, 0] } },
        },
      },
    ])

    const mind = mindAgg
      ? {
          totalWithMind: mindAgg.totalWithMind as number,
          avgChapter: Math.round((mindAgg.avgChapter as number) * 10) / 10,
          avgXp: Math.round(mindAgg.avgXp as number),
          engaged: mindAgg.engaged as number,
          visionCompleted: mindAgg.visionCompleted as number,
          chapterDistribution: [
            { chapter: 1, label: 'Reset',     count: mindAgg.ch1 as number },
            { chapter: 2, label: 'Foundation', count: mindAgg.ch2 as number },
            { chapter: 3, label: 'Edge',       count: mindAgg.ch3 as number },
            { chapter: 4, label: 'Defense',    count: mindAgg.ch4 as number },
            { chapter: 5, label: 'Architect',  count: mindAgg.ch5 as number },
          ],
        }
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
      mind,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
