'use client'

// Mission scene — commit to today's one move.
//
// This used to be a dead end: it printed a line and offered a single "I'm
// locking in" button, so a screen that asks you something had exactly one
// possible answer. Worse, the composer often wrote a REFLECTION into `prompt`
// ("Consider how a clearer environment could free up your energy…") which then
// rendered under the heading "your one move today" — a question presented as
// your own answer.
//
// Now it works the way the arsenal's typed steps do: the prompt is the NUDGE and
// the user names the move themselves. Their saved daily action is offered as a
// one-tap commit when they actually have one, and they can always write
// something else for today. The answer is reported up so it lands in the journal
// and in the session's adaptive close.

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Target, Check, ArrowRight, Pencil } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

const QUESTION = 'What is your one move today?'

export default function MissionScene({ move, onDone }: SceneProps) {
  // A saved daily action is a suggestion, not the answer.
  //
  // This used to disqualify anything over 14 words, on the theory that long text
  // was composer commentary. But `move.prompt` is the member's OWN saved mission
  // action, and theirs ran 15 words — so their real move was demoted to grey
  // commentary and they got a screen with no question on it at all. Length is
  // not the signal; shape is. Reject what reads like a prompt back at them,
  // and otherwise trust what they saved.
  const saved = move.prompt?.trim()
  const COMMENTARY = /^(consider|think about|notice|reflect|ask yourself|try|remember)\b/i
  const savedIsAction = !!saved && !saved.endsWith('?') && !COMMENTARY.test(saved)

  const [writing, setWriting] = useState(!savedIsAction)
  const [text, setText] = useState('')
  const [locked, setLocked] = useState<string | null>(null)

  const commit = (answer: string) => {
    if (locked || !answer) return
    setLocked(answer)
    setTimeout(() => onDone({ q: QUESTION, a: answer }), 900)
  }

  if (locked) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20"
        >
          <Check className="h-8 w-8 text-amber-300" strokeWidth={3} />
        </motion.span>
        <p className="text-sm font-semibold text-amber-300">Locked in.</p>
        <p className="mt-3 max-w-sm text-lg font-bold leading-snug text-white">{locked}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
        <Target className="h-6 w-6 text-amber-300" />
      </span>
      <p className="text-xs uppercase tracking-widest text-white/40">{move.title || 'Your one move today'}</p>
      {/* The heading is the QUESTION. It used to be `move.title || QUESTION`,
          and title is always set ("Lock in"), so the screen asked nothing and
          the member had to infer what it wanted from them. */}
      <h1 className="mt-4 max-w-sm text-2xl font-extrabold leading-snug">{QUESTION}</h1>

      {/* Anything prompt-shaped is context, never the answer. */}
      {saved && !savedIsAction && (
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/50">{saved}</p>
      )}

      {writing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Finish the section I keep pushing"
            rows={3}
            autoFocus
            className="mt-6 w-full max-w-sm resize-none rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-center text-base text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
          />
          <button
            onClick={() => commit(text.trim())}
            disabled={!text.trim()}
            className="mt-6 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-40"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
            Lock it in
          </button>
          {savedIsAction && (
            <button
              onClick={() => setWriting(false)}
              className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70"
            >
              Use my usual move instead
            </button>
          )}
          {!saved && (
            <Link
              href="/dashboard/mind/mission"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-white/40 transition-colors hover:text-white/70"
            >
              Set a daily non-negotiable
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="mt-6 max-w-sm rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-lg font-bold leading-snug text-white">
            {saved}
          </p>
          <button
            onClick={() => commit(saved ?? '')}
            className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
            That is the move
          </button>
          <button
            onClick={() => setWriting(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/50 transition-colors hover:text-white/80"
          >
            <Pencil className="h-3.5 w-3.5" />
            Something else today
          </button>
        </>
      )}
    </div>
  )
}
