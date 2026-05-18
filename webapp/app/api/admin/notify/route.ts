import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import PushSubscription from '@/models/PushSubscription'
import { sendPushToUser } from '@/lib/pushNotification'
import { verifyAdmin } from '@/lib/adminAuth'

export async function POST(request: NextRequest) {
  const adminResult = await verifyAdmin(request)
  if (!adminResult.success) {
    return NextResponse.json({ error: adminResult.error }, { status: adminResult.status ?? 401 })
  }

  const body = await request.json()
  const { email, title, bodyText, url, tag } = body as {
    email?: string
    title: string
    bodyText: string
    url?: string
    tag?: string
  }

  if (!title?.trim() || !bodyText?.trim()) {
    return NextResponse.json({ error: 'title and bodyText are required' }, { status: 400 })
  }

  await dbConnect()

  const payload = { title: title.trim(), body: bodyText.trim(), url: url || '/dashboard', tag: tag || 'admin-test' }

  // ── Single user ────────────────────────────────────────────────────────────
  if (email) {
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('_id').lean()
    if (!user) {
      return NextResponse.json({ error: `No user found for ${email}` }, { status: 404 })
    }
    const userId = String(user._id)
    const subCount = await PushSubscription.countDocuments({ userId })
    if (subCount === 0) {
      return NextResponse.json({ error: 'User has no push subscriptions', sent: 0 }, { status: 200 })
    }
    try {
      await sendPushToUser(userId, payload)
      return NextResponse.json({ sent: 1, subscriptions: subCount })
    } catch {
      return NextResponse.json({ error: 'Push delivery failed', sent: 0 }, { status: 500 })
    }
  }

  // ── Broadcast to all subscribed users ──────────────────────────────────────
  const distinctUserIds = await PushSubscription.distinct('userId')
  if (distinctUserIds.length === 0) {
    return NextResponse.json({ sent: 0, subscriptions: 0, errors: 0 })
  }

  const results = await Promise.allSettled(
    distinctUserIds.map((uid: string) => sendPushToUser(String(uid), payload))
  )

  const errors = results.filter((r) => r.status === 'rejected').length
  const sent = results.length - errors

  return NextResponse.json({ sent, subscriptions: distinctUserIds.length, errors })
}
