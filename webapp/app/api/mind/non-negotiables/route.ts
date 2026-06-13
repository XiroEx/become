// Standing non-negotiables for the Discipline system.
//   GET  ?tz=  → active non-negotiables w/ display streak + checkedToday
//   POST { text }                 → create
//   PATCH { id, action, tz?, text? }  action: 'check' | 'deactivate' | 'edit'

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindNonNegotiable from '@/models/MindNonNegotiable'
import { readTzOffset, readTzOffsetFromBody, localDateKey } from '@/lib/dayWindow'

const DAY_MS = 86_400_000

function todayAndYesterday(tz: number): { today: string; yesterday: string } {
  return {
    today: localDateKey(null, tz),
    yesterday: localDateKey(null, tz, new Date(Date.now() - DAY_MS)),
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()
    const tz = readTzOffset(new URL(request.url).searchParams)
    const { today, yesterday } = todayAndYesterday(tz)
    const docs = await MindNonNegotiable.find({ userId: auth.userId, active: true }).sort({ createdAt: 1 }).lean()
    const items = docs.map((d) => {
      const alive = d.lastCheckedKey === today || d.lastCheckedKey === yesterday
      return {
        id: String(d._id),
        text: d.text,
        currentStreak: alive ? (d.currentStreak ?? 0) : 0, // broken streaks show 0 until re-checked
        longestStreak: d.longestStreak ?? 0,
        checkedToday: d.lastCheckedKey === today,
      }
    })
    return NextResponse.json({ items })
  } catch (err) {
    console.error('GET /api/mind/non-negotiables error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const text = String(body.text || '').trim().slice(0, 200)
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
    await dbConnect()
    const count = await MindNonNegotiable.countDocuments({ userId: auth.userId, active: true })
    if (count >= 7) {
      return NextResponse.json({ error: 'Keep it tight — 7 non-negotiables max.' }, { status: 400 })
    }
    const doc = await MindNonNegotiable.create({ userId: auth.userId, text })
    return NextResponse.json({ id: String(doc._id), text: doc.text })
  } catch (err) {
    console.error('POST /api/mind/non-negotiables error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '')
    const action = String(body.action || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await dbConnect()
    const doc = await MindNonNegotiable.findOne({ _id: id, userId: auth.userId })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'deactivate') {
      doc.active = false
      await doc.save()
      return NextResponse.json({ ok: true })
    }
    if (action === 'edit') {
      const text = String(body.text || '').trim().slice(0, 200)
      if (text) { doc.text = text; await doc.save() }
      return NextResponse.json({ ok: true })
    }
    if (action === 'check') {
      const tz = readTzOffsetFromBody(body)
      const { today, yesterday } = todayAndYesterday(tz)
      if (doc.lastCheckedKey !== today) {
        doc.currentStreak = doc.lastCheckedKey === yesterday ? (doc.currentStreak ?? 0) + 1 : 1
        doc.lastCheckedKey = today
        doc.longestStreak = Math.max(doc.longestStreak ?? 0, doc.currentStreak)
        await doc.save()
      }
      return NextResponse.json({ currentStreak: doc.currentStreak, longestStreak: doc.longestStreak, checkedToday: true })
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (err) {
    console.error('PATCH /api/mind/non-negotiables error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
