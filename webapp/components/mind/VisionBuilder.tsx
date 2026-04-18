'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

interface VisionData {
  habits: string
  mind: string
  body: string
  relationships: string
  environment: string
  identityStatement: string
}

interface Step {
  key: keyof VisionData
  dimension: string
  prompt: string
  placeholder: string
  example: string
  color: string
}

const STEPS: Step[] = [
  {
    key: 'habits',
    dimension: 'Habits',
    prompt: 'In my best version, every day I...',
    placeholder: 'Wake at 5:30, train for an hour, read before bed, no phone in the morning...',
    example: 'Think about your morning, how you spend your time, what you do consistently.',
    color: 'text-blue-400',
  },
  {
    key: 'mind',
    dimension: 'Mind',
    prompt: 'My mind at its best feels and thinks...',
    placeholder: 'Focused, unshakeable, quick to recover, not affected by others\'s opinions...',
    example: 'How do you process challenges? What does your inner voice say at your best?',
    color: 'text-violet-400',
  },
  {
    key: 'body',
    dimension: 'Body',
    prompt: 'My body at its best looks and feels...',
    placeholder: 'Strong, energized, proud when I look in the mirror, pain-free, performing...',
    example: 'Not about perfection — about how you feel in your body every single day.',
    color: 'text-emerald-400',
  },
  {
    key: 'relationships',
    dimension: 'Relationships',
    prompt: 'The people in my life and how I show up...',
    placeholder: 'Deep connections, I\'m reliable and present, I cut drains without guilt...',
    example: 'Who do you want around you? How do you show up for the people who matter?',
    color: 'text-amber-400',
  },
  {
    key: 'environment',
    dimension: 'Environment',
    prompt: 'My world is built to support me by...',
    placeholder: 'Clean workspace, no distractions at home, surrounded by people who push me...',
    example: 'Your space, your digital environment, the inputs you allow in daily.',
    color: 'text-red-400',
  },
  {
    key: 'identityStatement',
    dimension: 'Identity',
    prompt: 'I am the kind of person who...',
    placeholder: 'Does the hard thing when others quit. Shows up every day regardless of how I feel...',
    example: 'This is your north star. One sentence that defines who you are at your best.',
    color: 'text-orange-400',
  },
]

interface Props {
  onComplete: (vision: VisionData) => void
}

export default function VisionBuilder({ onComplete }: Props) {
  const [phase, setPhase] = useState<'intro' | 'steps' | 'saving'>('intro')
  const [stepIdx, setStepIdx] = useState(0)
  const [values, setValues] = useState<VisionData>({
    habits: '', mind: '', body: '', relationships: '', environment: '', identityStatement: '',
  })
  const [saving, setSaving] = useState(false)

  const step = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1

  function handleNext() {
    if (isLast) {
      save()
    } else {
      setStepIdx(s => s + 1)
    }
  }

  function handleBack() {
    if (stepIdx > 0) setStepIdx(s => s - 1)
    else setPhase('intro')
  }

  async function save() {
    setSaving(true)
    try {
      const token = getToken()
      await fetch('/api/mind/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      })
      onComplete(values)
    } catch {
      setSaving(false)
    }
  }

  const canAdvance = values[step?.key]?.trim().length >= 10

  if (phase === 'intro') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-full flex-col items-center justify-center text-center px-2"
      >
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <Sparkles className="h-8 w-8 text-amber-400" />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-zinc-900 dark:text-white leading-tight">
          Build Your Vision
        </h2>
        <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs">
          You can&apos;t hit a target you can&apos;t see.
        </p>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs">
          In the next few minutes, you&apos;ll paint a picture of your best self across five dimensions. Be specific. Be honest. This becomes the north star that every other system points toward.
        </p>
        <button
          onClick={() => setPhase('steps')}
          className="flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 font-bold text-white"
        >
          Begin <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-4 text-xs text-zinc-400">6 questions · ~5 minutes</p>
      </motion.div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Progress dots */}
      <div className="mb-6 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i < stepIdx
                ? 'bg-amber-400'
                : i === stepIdx
                ? 'bg-amber-400/60'
                : 'bg-zinc-200 dark:bg-zinc-800'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={stepIdx}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
          className="flex flex-1 flex-col"
        >
          {/* Dimension label */}
          <p className={`mb-1 text-xs font-bold uppercase tracking-widest ${step.color}`}>
            {step.dimension} · {stepIdx + 1} of {STEPS.length}
          </p>

          {/* Main prompt */}
          <p className="mb-4 text-xl font-bold text-zinc-900 dark:text-white leading-snug">
            {step.prompt}
          </p>

          {/* Textarea */}
          <textarea
            value={values[step.key]}
            onChange={(e) => setValues(v => ({ ...v, [step.key]: e.target.value }))}
            placeholder={step.placeholder}
            rows={5}
            className="mb-3 w-full flex-1 resize-none rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 leading-relaxed"
          />

          {/* Example hint */}
          <p className="mb-6 text-xs text-zinc-400 dark:text-zinc-500 leading-snug">
            {step.example}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!canAdvance || saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-opacity"
        >
          {saving ? 'Saving...' : isLast ? 'Complete Vision' : 'Next'}
          {!isLast && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
