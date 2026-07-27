import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Program from '@/models/Program'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { rankPrograms } from '@/lib/programMatch'
import type { EquipmentType, ExperienceLevel, FitnessGoal, ProgramLike } from '@/lib/programMatch'

const VALID_GOALS: FitnessGoal[] = [
  'lose_weight',
  'gain_muscle',
  'maintain',
  'improve_performance',
  'general_health',
]
const VALID_LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced']
const VALID_EQUIPMENT: EquipmentType[] = ['none', 'dumbbells', 'barbell', 'cables', 'full_gym']

function csv<T extends string>(raw: string | null, valid: T[]): T[] | undefined {
  if (!raw) return undefined
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => (valid as string[]).includes(s))
  return parsed.length ? parsed : undefined
}

/**
 * GET /api/programs/recommend
 *
 * Ranks the catalog against the caller's answers and returns the top matches
 * with member-facing reasons.
 *
 * Query params (all optional) let the ONBOARDING wizard ask for
 * recommendations before the profile has been saved:
 *   goals=lose_weight,gain_muscle   ordered, index 0 = primary
 *   level=beginner|intermediate|advanced
 *   days=1..7
 *   equipment=none,dumbbells,...
 *   limit=1..10 (default 3)
 *   profile=0  do NOT fall back to the saved profile
 *
 * Anything omitted falls back to the saved profile, EXCEPT when profile=0.
 * The onboarding wizard passes profile=0 because it must rank on the answers
 * given in THIS session only — otherwise a member redoing onboarding gets
 * recommendations shaped by the equipment and experience they're in the middle
 * of replacing, and the goal step looks like it's ignoring them.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const sp = request.nextUrl.searchParams
    const limit = Math.min(10, Math.max(1, parseInt(sp.get('limit') || '3') || 3))

    let goals = csv(sp.get('goals'), VALID_GOALS)
    let level = csv(sp.get('level'), VALID_LEVELS)?.[0]
    const daysRaw = parseInt(sp.get('days') || '')
    let days = Number.isFinite(daysRaw) && daysRaw >= 1 && daysRaw <= 7 ? daysRaw : undefined
    let equipment = csv(sp.get('equipment'), VALID_EQUIPMENT)

    // Fall back to the saved profile for anything the caller didn't pass.
    const useProfile = sp.get('profile') !== '0'
    if (useProfile && (!goals || !level || !days || !equipment)) {
      const user = await User.findById(authResult.userId).select('profile').lean()
      const profile = user?.profile
      if (profile) {
        if (!goals) {
          const saved = ((profile.fitnessGoals ?? []) as string[]).filter(
            (g): g is FitnessGoal => VALID_GOALS.includes(g as FitnessGoal)
          )
          goals = saved.length
            ? saved
            : profile.fitnessGoal
              ? [profile.fitnessGoal as FitnessGoal]
              : undefined
        }
        if (!level && profile.experienceLevel) level = profile.experienceLevel as ExperienceLevel
        if (!days && profile.weeklyAvailability) days = profile.weeklyAvailability
        if (!equipment && profile.equipmentAccess?.length) {
          equipment = profile.equipmentAccess as EquipmentType[]
        }
      }
    }

    // Catalog only — never recommend another member's custom program.
    const programs = await Program.find(
      { isCustom: { $ne: true } },
      {
        program_id: 1,
        name: 1,
        description: 1,
        goal: 1,
        target_user: 1,
        training_days_per_week: 1,
        duration_weeks: 1,
        tags: 1,
        equipment: 1,
        coverImage: 1,
      }
    ).lean<ProgramLike[]>()

    const ranked = rankPrograms(programs, {
      goals,
      experienceLevel: level,
      weeklyAvailability: days,
      equipmentAccess: equipment,
    })

    return NextResponse.json({
      // Echo back what the ranking actually used, so the UI can explain itself
      // and tests can assert the inputs took effect.
      basedOn: { goals: goals ?? [], experienceLevel: level ?? null, weeklyAvailability: days ?? null, equipmentAccess: equipment ?? [] },
      recommendations: ranked.slice(0, limit).map(({ program, score, reasons }) => ({
        program_id: program.program_id,
        name: program.name,
        description: program.description ?? '',
        goal: program.goal ?? '',
        target_user: program.target_user ?? '',
        training_days_per_week: program.training_days_per_week ?? null,
        duration_weeks: program.duration_weeks ?? null,
        tags: program.tags ?? [],
        coverImage: program.coverImage ?? null,
        score,
        reasons,
      })),
    })
  } catch (error) {
    console.error('Error recommending programs:', error)
    return NextResponse.json({ error: 'Failed to recommend programs' }, { status: 500 })
  }
}
