// POST /api/suggestions/dismiss — dismisses a suggestion by id for the
// authenticated user. Idempotent: re-dismissing the same id replaces the
// existing dismissedAt instead of appending a duplicate entry.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { applyDismissal } from '@/lib/suggestions/applyDismissal'
import type { DismissedSuggestion } from '@/lib/suggestions/types'

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: unknown } | null = null
  try {
    body = (await request.json()) as { id?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
  }

  await dbConnect()

  const existing = await UserProgress.findOne({ userId: auth.userId })
  const existingList: DismissedSuggestion[] = existing?.dismissedSuggestions ?? []
  const { next, wasUpdate } = applyDismissal(existingList, id, new Date())

  if (existing) {
    existing.dismissedSuggestions = next
    await existing.save()
  } else {
    // Upsert: create a UserProgress doc for users who have none yet so the
    // dismissal sticks even on a brand-new account.
    await UserProgress.create({
      userId: auth.userId,
      dismissedSuggestions: next,
    })
  }

  return NextResponse.json({
    success: true,
    id,
    wasUpdate,
    count: next.length,
  })
}
