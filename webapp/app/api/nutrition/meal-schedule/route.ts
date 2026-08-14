import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import MealTagSchedule from '@/models/MealTagSchedule'
import { MINUTES_PER_DAY } from '@/lib/nutrition/mealSchedule'

/**
 * The member's meal-tag time windows.
 *
 * GET  -> { windows: [{ tag, startMinutes, endMinutes }] }
 * PUT  -> replaces the whole set. Sending fewer windows REMOVES the missing
 *         ones, which is what the editor screen wants: it holds the complete
 *         picture and saves it as a unit, so there is no separate delete call to
 *         get out of sync.
 *
 * A partial schedule is the expected shape, not a half-finished one. Someone who
 * works different hours every day should leave "Before Work" and "Snack"
 * unscheduled, so this never fills in gaps on the member's behalf.
 */

interface WindowInput {
  tag?: unknown
  startMinutes?: unknown
  endMinutes?: unknown
}

/**
 * Accept only whole minutes inside a day; null means "no time set".
 *
 * The explicit null/''/undefined check is load-bearing: `Number(null)` is 0, so
 * without it an UNSCHEDULED tag arrived as midnight, paired with a midnight end,
 * and the zero-length guard below rejected the whole save with "starts and ends
 * at the same time" — silently losing every reorder.
 */
export function cleanMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 0 || rounded >= MINUTES_PER_DAY) return null
  return rounded
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    const doc = await MealTagSchedule.findOne({ user: auth.userId })
      .select('windows')
      .lean<{ windows?: { tag: string; startMinutes: number; endMinutes: number }[] } | null>()
    return NextResponse.json({ windows: doc?.windows ?? [] })
  } catch (error) {
    console.error('GET /api/nutrition/meal-schedule error:', error)
    return NextResponse.json({ error: 'Failed to load meal schedule' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.windows)) {
      return NextResponse.json({ error: 'windows[] is required' }, { status: 400 })
    }

    // ORDER IS DATA. The array position is the member's meal order, which is
    // what places entries logged without a time — so an UNSCHEDULED tag must be
    // stored too, with null times, rather than dropped. Dropping them (which
    // this route used to do) would silently forget where "Snack" sits.
    //
    // Last write wins per tag, so a client that somehow sends a duplicate does
    // not create two rows that would both match in windowForTag.
    const byTag = new Map<string, { tag: string; startMinutes: number | null; endMinutes: number | null }>()
    for (const raw of body.windows as WindowInput[]) {
      const tag = typeof raw?.tag === 'string' ? raw.tag.trim().toLowerCase() : ''
      if (!tag) continue
      const startMinutes = cleanMinutes(raw?.startMinutes)
      const endMinutes = cleanMinutes(raw?.endMinutes)

      // Both ends or neither. Half a window is ambiguous, and silently treating
      // it as unscheduled would discard something the member typed.
      if ((startMinutes === null) !== (endMinutes === null)) {
        return NextResponse.json(
          { error: `"${tag}" needs both a start and an end, or neither` },
          { status: 400 },
        )
      }
      // Equal start and end would be a zero-length window that windowContains
      // treats as wrapping the ENTIRE day, swallowing every other tag. Reject it
      // rather than store a booby trap.
      if (startMinutes !== null && startMinutes === endMinutes) {
        return NextResponse.json(
          { error: `"${tag}" starts and ends at the same time` },
          { status: 400 },
        )
      }
      byTag.set(tag, { tag, startMinutes, endMinutes })
    }

    const windows = Array.from(byTag.values())

    await dbConnect()
    const doc = await MealTagSchedule.findOneAndUpdate(
      { user: auth.userId },
      { $set: { windows } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).select('windows').lean<{ windows?: typeof windows } | null>()

    return NextResponse.json({ windows: doc?.windows ?? windows })
  } catch (error) {
    console.error('PUT /api/nutrition/meal-schedule error:', error)
    return NextResponse.json({ error: 'Failed to save meal schedule' }, { status: 500 })
  }
}
