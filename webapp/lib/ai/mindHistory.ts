// Mind reflection memory — reads the user's OWN past answers back out of
// MindJournal so an AI-generated flow can reference and build on what they
// actually said (instead of asking the same static questions forever).
//
// Every GuidedFlow completion writes { system, kind, title, lines:[{prompt,answer}] }.
// Until now those answers were write-only. This assembler surfaces the recent
// ones — the requested system first (most relevant), then a little cross-system
// context — as structured data + a prompt-friendly summary string, to be merged
// into the `user` grounding sent to mind.generateFlow.

import dbConnect from '@/lib/mongodb'
import MindJournal from '@/models/MindJournal'

export interface MindReflection {
  system: string
  kind: string
  title: string
  daysAgo: number
  answers: { q: string; a: string }[]
}

export interface MindHistory {
  /** Structured recent reflections (system-first), newest first. */
  recentReflections: MindReflection[]
  /** Prompt-friendly one-per-line digest for graphs that interpolate strings. */
  reflectionSummary: string
}

const EMPTY: MindHistory = { recentReflections: [], reflectionSummary: '' }

function toReflection(d: Record<string, unknown>, now: number): MindReflection {
  const lines = Array.isArray(d.lines) ? (d.lines as Array<{ prompt?: string; answer?: string }>) : []
  const answers = lines
    .filter((l) => typeof l?.answer === 'string' && l.answer.trim())
    .map((l) => ({ q: String(l.prompt ?? '').trim(), a: String(l.answer ?? '').trim() }))
  const created = new Date(d.createdAt as string | number | Date).getTime()
  return {
    system: String(d.system ?? ''),
    kind: String(d.kind ?? ''),
    title: String(d.title ?? ''),
    daysAgo: Math.max(0, Math.floor((now - created) / 86_400_000)),
    answers,
  }
}

/**
 * Recent mind reflections for `userId`. When `system` is given, that system's
 * entries lead (they're the most relevant to the flow being generated) and a few
 * cross-system entries follow for broader continuity.
 */
export async function assembleMindHistory(
  userId: string,
  system?: string,
  limit = 6,
): Promise<MindHistory> {
  if (!userId) return EMPTY
  try {
    await dbConnect()
  } catch {
    return EMPTY
  }
  try {
    const now = Date.now()
    // Only entries that actually carry answers are useful here — a one-tap
    // pattern-catch (no lines) tells the AI nothing to build on.
    const base = { userId, 'lines.0': { $exists: true } }

    const perSystem = system
      ? await MindJournal.find({ ...base, system }).sort({ createdAt: -1 }).limit(limit).lean<Record<string, unknown>[]>()
      : []
    const seen = new Set(perSystem.map((d) => String(d._id)))
    const remaining = Math.max(0, limit - perSystem.length)
    const cross = remaining > 0
      ? (await MindJournal.find(base).sort({ createdAt: -1 }).limit(limit).lean<Record<string, unknown>[]>())
          .filter((d) => !seen.has(String(d._id)))
          .slice(0, remaining)
      : []

    const recentReflections = [...perSystem, ...cross].map((d) => toReflection(d, now)).filter((r) => r.answers.length > 0)

    const reflectionSummary = recentReflections
      .map((r) => {
        const ago = r.daysAgo === 0 ? 'today' : r.daysAgo === 1 ? 'yesterday' : `${r.daysAgo}d ago`
        const qa = r.answers.map((x) => (x.q ? `${x.q} → “${x.a}”` : `“${x.a}”`)).join('; ')
        return `[${r.system} · ${ago}] ${r.title}: ${qa}`
      })
      .join('\n')

    return { recentReflections, reflectionSummary }
  } catch {
    return EMPTY
  }
}
