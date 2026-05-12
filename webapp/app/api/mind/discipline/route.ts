import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import DisciplineChallenge from '@/models/DisciplineChallenge'
import MindProgress from '@/models/MindProgress'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  utcMidnightDateKey,
} from '@/lib/dayWindow'

const CHALLENGES = [
  'No complaining — not once — for the next 24 hours.',
  'No social media before 10am. Protect your first hours.',
  'Cold shower. End on cold. No negotiating.',
  'Write 5 minutes of uncensored thoughts immediately after waking.',
  'Zero processed food or alcohol today. Whole foods only.',
  'Reach out to someone you\'ve been putting off. Text, call, meet.',
  'Wake up 45 minutes earlier than your alarm. Use the time intentionally.',
  '100 push-ups before you leave the house. Any rep scheme.',
  'No phone for the first 60 minutes of your day.',
  'Sit in silence for 10 minutes. No music, no podcast, no distraction.',
  'Write down 10 things you\'re grateful for — specific, not generic.',
  'Prepare all your meals for tomorrow before you go to sleep.',
  'Be in bed with lights off by 10:30pm. Sleep is the weapon.',
  'Do something today that makes you slightly uncomfortable.',
  'Drink 3 liters of water. Track it.',
  'Write your mission statement from memory. Then read it twice.',
  'No complaining, no excuses. Own everything that happens today.',
  'Make your bed the moment you get up. Start with a win.',
  'Go for a 30-minute walk outside. No phone, no music.',
  'Identify your one most important task today and do it first.',
  'Send a genuine thank-you to someone who has helped you.',
  'Read for 30 minutes — a real book, not an article.',
  'Track every calorie you eat today. Awareness is the first step.',
  'Cut out caffeine after noon. Test your energy management.',
  'Write down three fears you\'ve been avoiding. Expose them.',
  'Do your workout even if you don\'t feel like it. Especially then.',
  'Have one difficult conversation you\'ve been avoiding.',
  'Log off social media entirely until tomorrow morning.',
  'Spend 10 minutes visualizing your ideal day in detail.',
  'Say no to something that doesn\'t align with your goals.',
]

// Pick the challenge for a given YYYY-MM-DD (caller's local day). Using the
// local YYYY-MM-DD ensures evening users in non-UTC zones see the SAME
// challenge across their whole local day, not a UTC-boundary rollover.
function getChallengeForLocalDay(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) return CHALLENGES[0]
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((d.getTime() - start) / (1000 * 60 * 60 * 24))
  return CHALLENGES[dayOfYear % CHALLENGES.length]
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const tzOffsetMinutes = readTzOffset(searchParams)
    const dayKey = localDateKey(null, tzOffsetMinutes)
    const today = utcMidnightDateKey(dayKey)
    const challenge = getChallengeForLocalDay(dayKey)

    // Upsert today's challenge doc (creates it on first view)
    const doc = await DisciplineChallenge.findOneAndUpdate(
      { userId: auth.userId, date: today },
      { $setOnInsert: { userId: auth.userId, date: today, challenge, completed: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({ challenge: doc })
  } catch (err) {
    console.error('GET /api/mind/discipline error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { action, excuse } = body as { action: 'complete' | 'excuse'; excuse?: string }
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (action !== 'complete' && action !== 'excuse') {
      return NextResponse.json({ error: 'action must be "complete" or "excuse"' }, { status: 400 })
    }

    await dbConnect()

    const today = utcMidnightDateKey(localDateKey(null, tzOffsetMinutes))

    if (action === 'complete') {
      const doc = await DisciplineChallenge.findOneAndUpdate(
        { userId: auth.userId, date: today },
        { completed: true, completedAt: new Date() },
        { new: true }
      ).lean()

      // Grant XP — fire and forget
      MindProgress.findOneAndUpdate(
        { userId: auth.userId },
        { $inc: { xp: 20 } },
        { upsert: true, setDefaultsOnInsert: true }
      ).catch(() => {})

      return NextResponse.json({ challenge: doc })
    }

    // action === 'excuse'
    if (!excuse || excuse.trim().length < 5) {
      return NextResponse.json({ error: 'Excuse text required' }, { status: 400 })
    }

    const EXCUSE_RESPONSES = [
      "That's not a reason. That's a story you're telling yourself.",
      "Everyone has that excuse. Champions do it anyway.",
      "The version of you that you want to become wouldn't accept that.",
      "You've handled harder things than this. Try again.",
      "That excuse has a solution. Find it.",
      "Discipline means doing it when the excuse is valid too.",
      "You'll respect yourself more at the end of the day if you push through.",
      "Your future self is watching this decision right now.",
    ]

    const response = EXCUSE_RESPONSES[Math.floor(Math.random() * EXCUSE_RESPONSES.length)]

    const doc = await DisciplineChallenge.findOneAndUpdate(
      { userId: auth.userId, date: today },
      { excuse: excuse.trim(), excuseResponse: response },
      { new: true }
    ).lean()

    return NextResponse.json({ challenge: doc, excuseResponse: response })
  } catch (err) {
    console.error('POST /api/mind/discipline error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
