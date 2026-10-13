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
 * The check-in also records that it was SHOWN, and this now does too, for the
 * same reason: a member who leaves a modal without pressing one of its buttons
 * has still been asked. Counting only dismissals meant the nudge was due on
 * every dashboard load and never once offered the way out.
 *
 * GET  → { due, showings, dismissCount, dontShowAgain, hasServerState }
 * POST → { action: 'shown' | 'dismiss' | 'dismiss_forever' | 'adopt' }
 */

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import {
  NudgeState,
  nudgeShowings,
  shouldShowNudge,
  recordNudgeShown,
  recordNudgeDismiss,
  recordNudgeDismissForever,
} from '@/lib/programNudge'

type StoredNudge = {
  dismissCount?: number
  lastDismissedAt?: Date
  dontShowAgain?: boolean
  shownCount?: number
  lastShownAt?: Date
}

/** The stored subdocument as the pure helpers want to see it. */
function toState(stored: StoredNudge | undefined | null): NudgeState | null {
  if (!stored || !hasServerState(stored)) return null
  return {
    dismissCount: stored.dismissCount ?? 0,
    ...(stored.lastDismissedAt
      ? { lastDismissedAt: new Date(stored.lastDismissedAt).toISOString() }
      : {}),
    ...(stored.lastShownAt
      ? { lastShownAt: new Date(stored.lastShownAt).toISOString() }
      : {}),
    ...(stored.shownCount ? { shownCount: stored.shownCount } : {}),
    ...(stored.dontShowAgain ? { dontShowAgain: true as const } : {}),
  }
}

/**
 * Has this member's nudge ever been recorded on this account? A stamp is the
 * tell — the schema defaults the counts to 0, so a row that has never been
 * touched still materialises `programNudge` with them.
 */
function hasServerState(stored: StoredNudge | undefined | null): boolean {
  return (
    !!stored?.lastDismissedAt || !!stored?.lastShownAt || stored?.dontShowAgain === true
  )
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
    // Prior showings — what the modal gates its opt-out on. Read BEFORE this
    // showing is recorded, so the first sighting reports 0 and the second, 1.
    showings: nudgeShowings(state),
    dismissCount: stored?.dismissCount ?? 0,
    dontShowAgain: stored?.dontShowAgain === true,
    hasServerState: hasServerState(stored),
  }
}

/** Write a state back onto the row, never clearing a stamp we already hold. */
function applyState(progress: { programNudge?: StoredNudge }, next: NudgeState) {
  const current = progress.programNudge
  progress.programNudge = {
    dismissCount: next.dismissCount,
    shownCount: Math.max(nudgeShowings(next), current?.shownCount ?? 0),
    ...(next.lastDismissedAt
      ? { lastDismissedAt: new Date(next.lastDismissedAt) }
      : current?.lastDismissedAt
        ? { lastDismissedAt: current.lastDismissedAt }
        : {}),
    ...(next.lastShownAt
      ? { lastShownAt: new Date(next.lastShownAt) }
      : current?.lastShownAt
        ? { lastShownAt: current.lastShownAt }
        : {}),
    // Once set, never cleared by a later plain dismissal or showing.
    dontShowAgain: next.dontShowAgain === true || current?.dontShowAgain === true,
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

    // No row at all: a brand-new member, who has no program and has been shown
    // nothing. The nudge is genuinely due and the opt-out is not offered yet.
    if (!progress) {
      return NextResponse.json({
        due: true,
        showings: 0,
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
      shownCount?: number
      lastDismissedAt?: string
      lastShownAt?: string
      dontShowAgain?: boolean
    }
    const action = body.action
    if (
      action !== 'shown' &&
      action !== 'dismiss' &&
      action !== 'dismiss_forever' &&
      action !== 'adopt'
    ) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    await dbConnect()

    const progress =
      (await UserProgress.findOne({ userId: auth.userId })) ??
      (await UserProgress.create({ userId: auth.userId }))

    const current = toState(progress.programNudge)

    let next: NudgeState
    if (action === 'shown') {
      next = recordNudgeShown(current)
    } else if (action === 'dismiss') {
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
      const clamp = (value: unknown): number => {
        const n = Number(value)
        return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), 99) : 0
      }
      const stamp = (value: unknown): string | undefined => {
        if (typeof value !== 'string') return undefined
        const when = new Date(value)
        return Number.isFinite(when.getTime()) ? when.toISOString() : undefined
      }
      const dismissedAt = stamp(body.lastDismissedAt)
      const shownAt = stamp(body.lastShownAt)
      next = {
        dismissCount: clamp(body.dismissCount),
        shownCount: Math.max(clamp(body.shownCount), clamp(body.dismissCount)),
        // Something has to anchor the backoff, so a record with no usable
        // stamp is treated as having last been seen just now.
        lastDismissedAt: dismissedAt ?? (shownAt ? undefined : new Date().toISOString()),
        ...(shownAt ? { lastShownAt: shownAt } : {}),
        ...(body.dontShowAgain === true ? { dontShowAgain: true as const } : {}),
      }
      // Nothing worth carrying — never seen it, and no opt-out.
      if (nudgeShowings(next) === 0 && !next.dontShowAgain) {
        return NextResponse.json({
          ...payload(progress.programNudge, isEnrolled(progress.currentProgram)),
          adopted: false,
        })
      }
    }

    applyState(progress, next)
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
