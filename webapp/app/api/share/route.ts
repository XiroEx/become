// POST /api/share — create a public, read-only snapshot share of a program, a
// single program workout, or a one-off / generated session.
//
// Body:
//   { kind: 'program',  programId }
//   { kind: 'workout',  programId, phase?, day }
//   { kind: 'session',  session: { title, focus?, exercises[] } }  // one-off/AI
import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import Share from '@/models/Share'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { hydrateProgram } from '@/lib/hydrateExercises'
import { genShareId, sanitizeWorkout } from '@/lib/share'
import type { Program, Phase, Workout } from '@/lib/data/programs'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    const kind = body?.kind
    if (!['program', 'workout', 'session'].includes(kind)) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }
    await dbConnect()

    const owner = await User.findById(auth.userId).select('name').lean<{ name?: string } | null>()
    const ownerName = owner?.name || undefined

    let title = 'Workout'
    let subtitle: string | undefined
    let payload: Record<string, unknown>
    let sourceProgramId: string | undefined

    if (kind === 'program' || kind === 'workout') {
      const programId = String(body?.programId || '')
      if (!programId) return NextResponse.json({ error: 'programId required' }, { status: 400 })
      const raw = await ProgramModel.findOne({ program_id: programId }).lean()
      if (!raw) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
      const hydrated = JSON.parse(JSON.stringify(await hydrateProgram(raw))) as Program
      sourceProgramId = hydrated.program_id

      if (kind === 'program') {
        title = hydrated.name
        subtitle = [hydrated.goal, hydrated.duration_weeks ? `${hydrated.duration_weeks} weeks` : null].filter(Boolean).join(' · ')
        payload = { program: hydrated }
      } else {
        // Single workout: find by phase (optional) + day.
        const day = String(body?.day || '')
        const phaseName = body?.phase ? String(body.phase) : undefined
        const phases: Phase[] = hydrated.phases || []
        let workout: Workout | undefined
        let phaseLabel: string | undefined
        for (const ph of phases) {
          if (phaseName && ph.phase !== phaseName) continue
          const w = (ph.workouts || []).find((x) => x.day === day)
          if (w) { workout = w; phaseLabel = ph.phase; break }
        }
        if (!workout) return NextResponse.json({ error: 'Workout not found' }, { status: 404 })
        title = workout.title
        subtitle = [hydrated.name, phaseLabel, workout.day].filter(Boolean).join(' · ')
        payload = { workout, programName: hydrated.name, phaseLabel }
      }
    } else {
      // One-off / generated session — snapshot the client-supplied content.
      const workout = sanitizeWorkout((body?.session ?? {}) as Record<string, unknown>)
      if (!workout) return NextResponse.json({ error: 'Session has no exercises' }, { status: 400 })
      title = workout.title
      const focus = typeof body?.session?.focus === 'string' ? body.session.focus : undefined
      subtitle = focus || 'Generated session'
      payload = { workout }
    }

    // Retry once on the (astronomically unlikely) shareId collision.
    let shareId = genShareId()
    for (let i = 0; i < 3; i++) {
      const exists = await Share.findOne({ shareId }).select('_id').lean()
      if (!exists) break
      shareId = genShareId()
    }

    await Share.create({ shareId, kind, ownerId: auth.userId, ownerName, title, subtitle, payload, sourceProgramId })
    return NextResponse.json({ shareId, url: `/share/${shareId}` }, { status: 201 })
  } catch (error) {
    console.error('Error creating share:', error)
    return NextResponse.json({ error: 'Failed to create share' }, { status: 500 })
  }
}
