'use client'

import { useState } from 'react'
import { Shield, ChevronRight, AlertTriangle } from 'lucide-react'
import { getPiecesBySection } from '@/lib/mindContent'
import { Card } from '@/components/ui'

// ─── Fear breakdown prompts ────────────────────────────────────────────────────

const FEAR_PROMPTS = [
  {
    trigger: "I'm scared I'll fail",
    questions: [
      'What specifically do you think will go wrong?',
      'What is the actual worst case, and could you recover from it?',
      'What has you assume failure over success?',
      'What would you do if you knew you could not fail?',
    ],
  },
  {
    trigger: "I don't think I'm good enough",
    questions: [
      'Good enough compared to what standard?',
      'Has that standard been set by you or by someone else?',
      'What evidence do you have that contradicts this belief?',
      'If a friend said this about themselves, what would you tell them?',
    ],
  },
  {
    trigger: "I'm afraid of what people will think",
    questions: [
      "Whose opinion specifically are you worried about?",
      "Do they control your outcomes or just your feelings?",
      "If you succeed, will their opinion change?",
      "If they're watching you closely enough to judge, aren't they impressed by the attempt?",
    ],
  },
  {
    trigger: "I don't have enough time",
    questions: [
      'How much time does this actually require per day?',
      'What are you spending time on that is lower priority?',
      'Is time the real constraint or is it energy and clarity?',
      'What is the cost of not making time for this?',
    ],
  },
]

// ─── Sabotage patterns ─────────────────────────────────────────────────────────

const SABOTAGE_PATTERNS = [
  {
    pattern: 'All-or-nothing thinking',
    description: 'Missing one workout becomes "I ruined everything." One bad meal becomes "I give up."',
    override: 'Progress is not linear. One miss changes nothing unless you let it.',
  },
  {
    pattern: 'Waiting to feel ready',
    description: 'Telling yourself you\'ll start when motivation comes. Motivation follows action, not the other way around.',
    override: 'Do it now. Even 10%. The feeling comes after you start.',
  },
  {
    pattern: 'Perfectionism as avoidance',
    description: 'Planning the perfect plan instead of executing an imperfect one. Preparation as procrastination.',
    override: 'A mediocre plan executed beats a perfect plan sitting in your notes app.',
  },
  {
    pattern: 'Comparing your chapter 1 to someone\'s chapter 20',
    description: 'Measuring your beginning against someone else\'s result. Demoralizing and irrelevant.',
    override: 'Your only competition is who you were yesterday.',
  },
  {
    pattern: 'Comfort-seeking over growth',
    description: 'Choosing the path of least resistance at key decision points — then rationalizing it afterward.',
    override: 'Notice the moment you\'re about to take the easy path. That\'s the exact moment your growth happens.',
  },
]

// ─── Components ────────────────────────────────────────────────────────────────

function FearBreakdown() {
  const [selected, setSelected] = useState<number | null>(null)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [current, setCurrent] = useState('')

  function select(i: number) {
    setSelected(i)
    setStep(0)
    setAnswers([])
    setCurrent('')
  }

  function next() {
    const newAnswers = [...answers, current]
    setAnswers(newAnswers)
    setCurrent('')
    const fear = FEAR_PROMPTS[selected!]
    if (step + 1 < fear.questions.length) {
      setStep(step + 1)
    } else {
      setStep(fear.questions.length) // done
    }
  }

  function reset() {
    setSelected(null)
    setStep(0)
    setAnswers([])
    setCurrent('')
  }

  if (selected === null) {
    return (
      <div className="space-y-2">
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Pick the fear that&apos;s running in the background right now.
        </p>
        {FEAR_PROMPTS.map((f, i) => (
          <button
            key={i}
            onClick={() => select(i)}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3 text-left hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
          >
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{f.trigger}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
        ))}
      </div>
    )
  }

  const fear = FEAR_PROMPTS[selected]
  const isDone = step >= fear.questions.length

  return (
    <div>
      <button onClick={reset} className="mb-4 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
        ← Different fear
      </button>
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Fear Breakdown
      </p>

      {!isDone ? (
        <>
          <p className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">
            {fear.questions[step]}
          </p>
          <p className="mb-4 text-xs text-zinc-400">Question {step + 1} of {fear.questions.length}</p>
          <textarea
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Write your honest answer..."
            rows={3}
            className="mb-3 w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none"
          />
          <button
            onClick={next}
            disabled={current.trim().length < 3}
            className="w-full rounded-lg bg-zinc-900 dark:bg-white py-3 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-40"
          >
            {step + 1 < fear.questions.length ? 'Next question' : 'Finish'}
          </button>
        </>
      ) : (
        <div>
          <p className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">
            You broke it down. Now it&apos;s just a problem, not a wall.
          </p>
          <div className="space-y-3 mb-5">
            {answers.map((a, i) => (
              <div key={i} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-2.5">
                <p className="text-xs text-zinc-400 mb-1">{fear.questions[i]}</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{a}</p>
              </div>
            ))}
          </div>
          <button
            onClick={reset}
            className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300"
          >
            Explore another fear
          </button>
        </div>
      )}
    </div>
  )
}

function PatternDetector() {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        Recognize the pattern before it runs you.
      </p>
      <div className="-mx-3 sm:-mx-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
        {SABOTAGE_PATTERNS.map((p, i) => (
          <div key={i}>
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">{p.pattern}</span>
              </div>
              <span className="text-zinc-400 text-lg ml-2 shrink-0">{expanded === i ? '−' : '+'}</span>
            </button>
            {expanded === i && (
              <div className="px-3 pb-3 pt-1 space-y-3">
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p.description}</p>
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-1">Override</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{p.override}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main tab ──────────────────────────────────────────────────────────────────

type Section = 'fear' | 'patterns'

export default function AntiSabotageTab() {
  const [section, setSection] = useState<Section>('fear')

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Anti-Sabotage</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Most failure is self-inflicted. The patterns that keep you stuck are predictable — which means they&apos;re defeatable. Use this to identify and interrupt them.
            </p>
          </div>
        </div>
      </Card>

      {/* Section toggle */}
      <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1">
        {(['fear', 'patterns'] as Section[]).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`flex-1 rounded-md py-2 text-xs font-semibold capitalize transition-all ${
              section === s
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {s === 'fear' ? 'Fear Breakdown' : 'Pattern Detector'}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        {section === 'fear' ? <FearBreakdown /> : <PatternDetector />}
      </Card>

      {/* Anti-sabotage protocols from content library */}
      <AntiSabotageProtocols />
    </div>
  )
}

const ANTI_PROTOCOLS = getPiecesBySection('anti-sabotage')

function AntiSabotageProtocols() {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <Card>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Interrupt Protocols
      </p>
      <p className="mb-4 text-sm text-zinc-500">Use these the moment you feel a bad pattern starting.</p>
      <div className="-mx-3 sm:-mx-4 -mb-3 sm:-mb-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-t border-zinc-200 dark:border-zinc-800">
        {ANTI_PROTOCOLS.map((p) => (
          <div key={p.id}>
            <button
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-white">{p.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{p.source}</p>
              </div>
              <span className="text-zinc-400 text-lg ml-2 shrink-0">{expanded === p.id ? '−' : '+'}</span>
            </button>
            {expanded === p.id && (
              <div className="px-3 pb-3 pt-1">
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-2.5">
                  <p className="text-sm font-semibold italic text-zinc-800 dark:text-zinc-200 mb-2">
                    &ldquo;{p.mantra}&rdquo;
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p.instruction}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
