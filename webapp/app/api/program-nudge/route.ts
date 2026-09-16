/**
 * "Ready to start a training program?" nudge — gating and dismissal.
 *
 * The decision used to be made entirely in the browser off a localStorage key.
 * That is why the "Don't show this again" opt-out did not work: the dismissal
 * count it is gated on rarely survived long enough to reach the threshold, and
 * the opt-out itself was written to the same evictable, per-storage-container
 * key. lib/programNudge.ts has the full reasoning; app/api/checkin/route.ts is
 * the same move made earlier for the daily check-in.
 *
 * GET  → { due, dismissCount, dontShowAgain, hasServerState }
 * POST → { action: 'dismiss' | 'dismiss_forever' | 'adopt' }
 */

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import {
  NudgeState,
  shouldShowNudge,
  recordNudgeDismiss,
  recordNudgeDismissForever,
} from '@/lib/programNudge'

type StoredNudge = {
  dismissCount?: number
  lastDismissedAt?: Date
  dontShowAgain?: boolean
}

/** The stored subdocument as the pure helpers want to see it. */
function toState(stored: StoredNudge | undefined | null): NudgeState | null {
  if (!stored || !stored.lastDismissedAt) return null
  return {
    dismissCount: stored.dismissCount ?? 0,
    lastDismissedAt: new Date(stored.lastDismissedAt).toISOString(),
    ...(stored.dontShowAgain ? { dontShowAgain: true as const } : {}),
  }
}

/**
 * Has this member ever dismissed the nudge on this account? `lastDismissedAt`
 * is the tell — the schema defaults `dismissCount` to 0, so a row that has
 * never been touched still materialises `programNudge` with a count.
 */
function hasServerState(stored: StoredNudge | undefined | null): boolean {
  return !!stored?.lastDismissedAt || stored?.dontShowAgain === true
}

/**
 * Is this member actually in a program? Not `!!currentProgram` — that is a
 * NESTED path, so Mongoose materialises it as `{}` on any hydrated document
 * and the empty object is truthy. Every member would have read as enrolled and
 * the nudge would never have fired at all. `programId` is the real tell.
 */
function isEnrolled(currentProgram: { programId?: string } | undefined | null): boolean {
  return !!currentProgram?.programId
}

function payload(stored: StoredNudge | undefined | null, enrolled: boolean) {
  const state = toState(stored)
  return {
    // Enrolled members never see it, whatever the dismissal history says.
    due: enrolled ? false : shouldShowNudge(state),
    dismissCount: stored?.dismissCount ?? 0,
    dontShowAgain: stored?.dontShowAgain === true,
    hasServerState: hasServerState(stored),
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ due: false, reason: 'unauthenticated' })
    }

    await dbConnect()
    const progress = await UserProgress.findOne({ userId: auth.userId })
      .select('programNudge currentProgram')
      .lean()

    // No row at all: a brand-new member, who has no program and has dismissed
    // nothing. The nudge is genuinely due and the opt-out is not offered yet.
    if (!progress) {
      return NextResponse.json({
        due: true,
        dismissCount: 0,
        dontShowAgain: false,
        hasServerState: false,
      })
    }

    return NextResponse.json(payload(progress.programNudge, isEnrolled(progress.currentProgram)))
  } catch (error) {
    console.error('Error resolving program nudge:', error)
    // Fail closed: a broken read must not spam the member with a modal.
    return NextResponse.json({ due: false, reason: 'error' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      dismissCount?: number
      lastDismissedAt?: string
      dontShowAgain?: boolean
    }
    const action = body.action
    if (action !== 'dismiss' && action !== 'dismiss_forever' && action !== 'adopt') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    await dbConnect()

    const progress =
      (await UserProgress.findOne({ userId: auth.userId })) ??
      (await UserProgress.create({ userId: auth.userId }))

    const current = toState(progress.programNudge)

    let next: NudgeState
    if (action === 'dismiss') {
      next = recordNudgeDismiss(current)
    } else if (action === 'dismiss_forever') {
      next = recordNudgeDismissForever(current)
    } else {
      // One-time migration of a pre-existing localStorage record onto the
      // account. It is only ever allowed to WRITE state, never to replace it:
      // replaying an old local snapshot must not be able to undo a dismissal
      // the member has since made on another device.
      if (hasServerState(progress.programNudge)) {
        return NextResponse.json({
          ...payload(progress.programNudge, isEnrolled(progress.currentProgram)),
          adopted: false,
        })
      }
      const count = Number(body.dismissCount)
      const stamp = body.lastDismissedAt ? new Date(body.lastDismissedAt) : null
      next = {
        dismissCount: Number.isFinite(count) ? Math.min(Math.max(Math.trunc(count), 0), 99) : 0,
        lastDismissedAt: (stamp && Number.isFinite(stamp.getTime())
          ? stamp
          : new Date()
        ).toISOString(),
        ...(body.dontShowAgain === true ? { dontShowAgain: true as const } : {}),
      }
      // Nothing worth adopting — no dismissals and no opt-out.
      if (next.dismissCount === 0 && !next.dontShowAgain) {
        return NextResponse.json({
          ...payload(progress.programNudge, isEnrolled(progress.currentProgram)),
          adopted: false,
        })
      }
    }

    progress.programNudge = {
      dismissCount: next.dismissCount,
      lastDismissedAt: new Date(next.lastDismissedAt),
      // Once set, never cleared by a later plain dismissal.
      dontShowAgain: next.dontShowAgain === true || progress.programNudge?.dontShowAgain === true,
    }
    await progress.save()

    return NextResponse.json({
      ...payload(progress.programNudge, isEnrolled(progress.currentProgram)),
      adopted: action === 'adopt',
    })
  } catch (error) {
    console.error('Error recording program nudge action:', error)
    return NextResponse.json({ error: 'Failed to record program nudge' }, { status: 500 })
  }
}
