// Adaptive close for the static Mind protocols. Given the answers the user just
// typed in a GuidedFlow, ask the in-session coach (mind.coachReply — already
// grounded in the user's real data + reflection memory) for a short, personal
// response that names what they said, reassures, gives one concrete piece of
// advice, and pushes them to keep going. Returns null on empty input or any
// failure, so GuidedFlow falls back to the static close and never breaks.

import { runAiTask } from '@/lib/ai/runClient'

export async function reflectOnAnswers(
  systemLabel: string,
  answers: { prompt: string; answer: string }[],
): Promise<string | null> {
  const typed = answers.filter((a) => (a.answer ?? '').trim().length > 0)
  if (typed.length === 0) return null

  const qa = typed.map((a) => `- ${a.prompt} → “${a.answer}”`).join('\n')
  const message =
    `I just finished a ${systemLabel} in the Mind section. Here is exactly what I wrote:\n${qa}\n\n` +
    `Respond directly to me in 2–3 sentences: name what I actually said, reassure me, ` +
    `give me ONE concrete piece of advice tied to my answers, and end with a short push to keep going. ` +
    `Warm and direct, no fluff, no lists. Never name a book, author, or source. ` +
    // This is mindset work. The coach has my whole cross-app context including my
    // training schedule, and it kept closing sessions with "go hit that Chest and
    // Back session" — which turns inner work into a workout reminder.
    `This is MINDSET work: do not mention my workouts, my training schedule, or what ` +
    `is programmed for me today. Stay on what I just wrote.`

  try {
    const r = await runAiTask('/api/ai/mind/coach', { message })
    const t = (
      r.text ||
      r.reply ||
      (typeof r.result === 'string' ? r.result : '') ||
      ''
    ).toString().trim()
    return t || null
  } catch {
    return null
  }
}
