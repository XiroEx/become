'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import { Card } from '@/components/ui'

// ─── Content ───────────────────────────────────────────────────────────────────

const CONVERSATION_STARTERS = [
  {
    category: 'Ambition',
    prompts: [
      "What's something you're working toward that most people in your life don't know about?",
      "If you could spend the next year working on anything, what would it be?",
      "What's the last decision you made that scared you a little?",
    ],
  },
  {
    category: 'Standards',
    prompts: [
      "Who in your life pushes you to be better just by being around them?",
      "What's something you used to accept that you no longer tolerate?",
      "If someone watched how you spent your last 30 days, what would they say your priorities are?",
    ],
  },
  {
    category: 'Mindset',
    prompts: [
      "What belief about yourself has changed the most in the last year?",
      "What's the hardest thing you've done recently that you're proud of?",
      "What's a lesson you learned the hard way that you wish you knew earlier?",
    ],
  },
]

const PERSPECTIVE_CARDS = [
  {
    title: 'Your environment is your fate',
    body: "You cannot consistently outperform your environment. If the people around you normalize mediocrity — in health, discipline, or ambition — you will drift toward that over time. This isn't willpower failure. It's physics. Upgrade the room.",
  },
  {
    title: 'Average is contagious',
    body: "Behavior, standards, and mindset spread socially. Spend enough time with people who skip workouts, eat poorly, and complain — and you will start to as well. The opposite is equally true. Get around people who make your standards feel low.",
  },
  {
    title: 'You don\'t need more people. You need better ones.',
    body: 'A smaller circle of high-quality relationships outperforms a large network of shallow ones. One person who holds you accountable is worth 50 who tolerate your excuses.',
  },
  {
    title: 'Influence flows both ways',
    body: "You are both receiving and transmitting. The people around you are drifting toward your standards just as you are drifting toward theirs. Be worth being around. Show up as the version of yourself others should be influenced by.",
  },
  {
    title: 'Hard conversations are expensive to avoid',
    body: "Avoiding difficult conversations with people in your life doesn't make the problem smaller. It makes you smaller. Say the thing. Have the conversation. The short-term discomfort is a fraction of the long-term cost.",
  },
]

const ACCOUNTABILITY_PROMPTS = [
  'Text someone your workout plan for today. Do it before you have the option not to.',
  'Tell one person in your life about a goal you\'ve been keeping to yourself.',
  'Find one person who has what you want. Ask them one specific question this week.',
  'Schedule a check-in with someone who will ask you the hard question about your progress.',
  'Be honest with someone about where you actually are — not where you want to appear to be.',
]

// ─── Components ────────────────────────────────────────────────────────────────

function ConversationStarters() {
  const [category, setCategory] = useState(0)
  const [promptIdx, setPromptIdx] = useState(0)

  const cat = CONVERSATION_STARTERS[category]
  const prompt = cat.prompts[promptIdx]

  function next() {
    setPromptIdx((i) => (i + 1) % cat.prompts.length)
  }

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        Use these to start real conversations — not small talk.
      </p>
      <div className="mb-4 flex gap-2">
        {CONVERSATION_STARTERS.map((c, i) => (
          <button
            key={c.category}
            onClick={() => { setCategory(i); setPromptIdx(0) }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              category === i
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            {c.category}
          </button>
        ))}
      </div>
      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-2.5">
        <p className="text-base font-semibold leading-snug text-zinc-900 dark:text-white">
          &ldquo;{prompt}&rdquo;
        </p>
      </div>
      <button
        onClick={next}
        className="mt-3 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all"
      >
        Next prompt
      </button>
    </div>
  )
}

function PerspectiveShifts() {
  const [expanded, setExpanded] = useState<number | null>(0)

  return (
    <div className="-mx-3 sm:-mx-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
      {PERSPECTIVE_CARDS.map((c, i) => (
        <div key={i}>
          <button
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-sm font-semibold text-zinc-900 dark:text-white pr-2">{c.title}</span>
            <span className="text-zinc-400 text-lg shrink-0">{expanded === i ? '−' : '+'}</span>
          </button>
          {expanded === i && (
            <div className="px-3 pb-3 pt-1">
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{c.body}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AccountabilityActions() {
  const [dismissed, setDismissed] = useState<number[]>([])

  const todayIdx =
    Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)) %
    ACCOUNTABILITY_PROMPTS.length

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        One action to strengthen your environment today.
      </p>
      <div className="space-y-2">
        {ACCOUNTABILITY_PROMPTS.map((p, i) => {
          const isToday = i === todayIdx
          const done = dismissed.includes(i)
          return (
            <div
              key={i}
              className={`rounded-lg p-3 ${
                isToday
                  ? 'bg-zinc-900'
                  : 'bg-zinc-50 dark:bg-zinc-800/50'
              } ${done ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${isToday ? 'bg-white' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                <p className={`flex-1 text-sm ${isToday ? 'font-semibold text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {p}
                </p>
                {!done && (
                  <button
                    onClick={() => setDismissed((d) => [...d, i])}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${
                      isToday
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-zinc-200/70 dark:bg-zinc-700/70 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main tab ──────────────────────────────────────────────────────────────────

type Section = 'conversation' | 'perspective' | 'accountability'

export default function SocialTab() {
  const [section, setSection] = useState<Section>('perspective')

  const sections: { id: Section; label: string }[] = [
    { id: 'perspective', label: 'Environment' },
    { id: 'conversation', label: 'Conversations' },
    { id: 'accountability', label: 'Actions' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Social Environment</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Your environment shapes your outcomes more than motivation ever will. Who you spend time with determines who you become.
            </p>
          </div>
        </div>
      </Card>

      {/* Section toggle */}
      <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all ${
              section === s.id
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        {section === 'conversation' && <ConversationStarters />}
        {section === 'perspective' && <PerspectiveShifts />}
        {section === 'accountability' && <AccountabilityActions />}
      </Card>
    </div>
  )
}
