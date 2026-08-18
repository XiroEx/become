// GET /api/goals?tz=   → then → now → next for nutrition and training, plus the
//                        per-pillar "where to work on next" (see lib/goals/*)
// PUT /api/goals        { pillar: 'nutrition', paceKgPerWeek?, adherence?: { logDaysPerWeek?, proteinDaysPerWeek? } }
//                       { pillar: 'training', daysPerWeek?, lifts?: 'suggested' | [{ slug, name, baselineE1RM, targetE1RM }] | [] }
//                       Returns the fresh GET payload.

import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { readTzOffset, readOptionalTzOffsetFromBody } from '@/lib/dayWindow'
import Goal from '@/models/Goal'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import { computeGoalProgress } from '@/lib/goals/progress'
import { ensureGoals, prSnapshot } from '@/lib/goals/ensure'
import { clampPaceKg } from '@/lib/goals/pace'
import { suggestLiftTargets } from '@/lib/goals/training'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()
    return NextResponse.json(await computeGoalProgress(auth.userId!, readTzOffset(request.nextUrl.searchParams)))
  } catch (error) {
    console.error('GET /api/goals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    await dbConnect()
    const userId = auth.userId!
    const tz = readOptionalTzOffsetFromBody(body) ?? 0
    const uid = new Types.ObjectId(userId)

    if (body.pillar === 'nutrition') {
      // Make sure the goal exists (onboarding sets pace right after the profile).
      const { nutrition } = await ensureGoals(userId)
      if (!nutrition) return NextResponse.json({ error: 'No target weight set' }, { status: 400 })
      const set: Record<string, unknown> = {}
      if (typeof body.paceKgPerWeek === 'number') set['target.paceKgPerWeek'] = clampPaceKg(body.paceKgPerWeek)
      const adh = body.adherence as Record<string, unknown> | undefined
      if (adh && typeof adh === 'object') {
        if (typeof adh.logDaysPerWeek === 'number') set['adherence.logDaysPerWeek'] = Math.max(0, Math.min(7, Math.round(adh.logDaysPerWeek)))
        if (typeof adh.proteinDaysPerWeek === 'number') set['adherence.proteinDaysPerWeek'] = Math.max(0, Math.min(7, Math.round(adh.proteinDaysPerWeek)))
      }
      if (Object.keys(set).length) await Goal.updateOne({ _id: nutrition._id }, { $set: set })
      return NextResponse.json(await computeGoalProgress(userId, tz))
    }

    if (body.pillar === 'training') {
      if (typeof body.daysPerWeek === 'number' && Number.isFinite(body.daysPerWeek)) {
        const days = Math.max(1, Math.min(7, Math.round(body.daysPerWeek)))
        // Profile is the input; ensureGoals will carry it into the goal.
        await User.updateOne({ _id: uid }, { $set: { 'profile.weeklyAvailability': days } })
      }
      const { training } = await ensureGoals(userId)
      if (body.lifts !== undefined) {
        if (!training) return NextResponse.json({ error: 'Set your training days first' }, { status: 400 })
        let lifts: Array<{ slug: string; name: string; baselineE1RM: number; targetE1RM: number }> = []
        if (body.lifts === 'suggested') {
          const up = await UserProgress.findOne({ userId }).select('exercisePRs').lean() as Record<string, unknown> | null
          lifts = suggestLiftTargets(prSnapshot(up?.exercisePRs as Parameters<typeof prSnapshot>[0]))
        } else if (Array.isArray(body.lifts)) {
          lifts = (body.lifts as unknown[]).flatMap(l => {
            const o = l as Record<string, unknown>
            if (typeof o?.slug !== 'string' || typeof o?.targetE1RM !== 'number') return []
            return [{
              slug: o.slug,
              name: typeof o.name === 'string' ? o.name : o.slug,
              baselineE1RM: typeof o.baselineE1RM === 'number' ? o.baselineE1RM : 0,
              targetE1RM: Math.max(1, Math.round(o.targetE1RM)),
            }]
          }).slice(0, 5)
        }
        await Goal.updateOne({ _id: training._id }, { $set: { 'target.lifts': lifts } })
      }
      return NextResponse.json(await computeGoalProgress(userId, tz))
    }

    return NextResponse.json({ error: 'pillar must be nutrition or training' }, { status: 400 })
  } catch (error) {
    console.error('PUT /api/goals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
