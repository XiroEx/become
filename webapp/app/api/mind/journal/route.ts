// GET  /api/mind/journal?system=anti-sabotage&limit=10 → recent entries + per-kind counts
// POST /api/mind/journal { system, kind, title, lines? } → save one entry

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindJournal from '@/models/MindJournal'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()
    const sp = new URL(request.url).searchParams
    const system = sp.get('system') || undefined
    const limitParam = Number(sp.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, limitParam) : 10
    const q: Record<string, unknown> = { userId: auth.userId }
    if (system) q.system = system
    const entries = await MindJournal.find(q).sort({ createdAt: -1 }).limit(limit).lean()
    const countsAgg: Array<{ _id: string; n: number }> = await MindJournal.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(auth.userId), ...(system ? { system } : {}) } },
      { $group: { _id: '$kind', n: { $sum: 1 } } },
    ])
    const counts: Record<string, number> = {}
    for (const c of countsAgg) counts[c._id] = c.n
    return NextResponse.json({ entries, counts })
  } catch (err) {
    console.error('GET /api/mind/journal error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const system = String(body.system || '').slice(0, 50)
    const kind = String(body.kind || '').slice(0, 50)
    const title = String(body.title || '').slice(0, 200)
    if (!system || !kind || !title) {
      return NextResponse.json({ error: 'system, kind, title required' }, { status: 400 })
    }
    const lines = Array.isArray(body.lines)
      ? body.lines.slice(0, 12).map((l: { prompt?: unknown; answer?: unknown }) => ({
          prompt: String(l.prompt ?? '').slice(0, 500),
          answer: String(l.answer ?? '').slice(0, 2000),
        }))
      : []
    await dbConnect()
    const doc = await MindJournal.create({ userId: auth.userId, system, kind, title, lines })
    return NextResponse.json({ saved: true, id: String(doc._id) })
  } catch (err) {
    console.error('POST /api/mind/journal error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
