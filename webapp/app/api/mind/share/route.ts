// POST /api/mind/share — snapshot one or more composed Mind sessions into a
// public, read-only SharedSession and return its share link. Auth required.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import SharedSession, { ISharedSessionEntry } from '@/models/SharedSession'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'

/** A composed plan is shareable when it has an intro + a non-empty moves array. */
function isValidPlan(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false
  const plan = p as { intro?: unknown; moves?: unknown }
  return !!plan.intro && Array.isArray(plan.moves) && plan.moves.length > 0
}

function newToken(): string {
  // URL-safe, unguessable, short-ish.
  return crypto.randomBytes(12).toString('base64url')
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

    const kind = body.kind === 'program' ? 'program' : 'session'
    // Accept either a single { plan } or a { sessions: [{ title?, plan }] } array.
    const rawSessions: Array<{ title?: string; plan?: unknown }> = Array.isArray(body.sessions)
      ? body.sessions
      : body.plan != null
        ? [{ title: typeof body.title === 'string' ? body.title : undefined, plan: body.plan }]
        : []
    const sessions: ISharedSessionEntry[] = rawSessions
      .filter(s => isValidPlan(s?.plan))
      .slice(0, 50)
      .map(s => ({ title: typeof s.title === 'string' ? s.title.slice(0, 120) : undefined, plan: s.plan }))
    if (sessions.length === 0) {
      return NextResponse.json({ error: 'No valid session plan(s) to share' }, { status: 400 })
    }

    await dbConnect()

    // Title: explicit, else the first session's intro title, else a default.
    const firstPlan = sessions[0].plan as { intro?: { title?: string } }
    const title = (typeof body.title === 'string' && body.title.trim())
      ? body.title.trim().slice(0, 140)
      : (firstPlan?.intro?.title || 'Become session')

    let ownerName: string | undefined
    try {
      const u = await User.findById(auth.userId).select('name').lean<{ name?: string } | null>()
      ownerName = u?.name || undefined
    } catch { /* non-fatal */ }

    // Retry token a couple times on the (astronomically unlikely) unique clash.
    let doc = null
    for (let i = 0; i < 3 && !doc; i++) {
      try {
        doc = await SharedSession.create({
          token: newToken(),
          owner: new mongoose.Types.ObjectId(auth.userId),
          ownerName,
          kind: sessions.length > 1 ? 'program' : kind,
          title,
          description: typeof body.description === 'string' ? body.description.slice(0, 500) : undefined,
          sessions,
          sourceSystemId: typeof body.sourceSystemId === 'string' ? body.sourceSystemId : undefined,
          programId: body.programId && mongoose.Types.ObjectId.isValid(String(body.programId))
            ? new mongoose.Types.ObjectId(String(body.programId)) : undefined,
          viewCount: 0,
        })
      } catch (e) {
        if (i === 2) throw e
      }
    }

    return NextResponse.json({ token: doc!.token, url: `/share/${doc!.token}` }, { status: 201 })
  } catch (error) {
    console.error('Error creating shared session:', error)
    return NextResponse.json({ error: 'Failed to create share' }, { status: 500 })
  }
}
