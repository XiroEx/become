'use client'

// Mind Lab — Speech tab. Validates the Web Speech API speech-detection that will
// power the Speak/Mirror affirm modalities (see MIND_SPEECH_DETECTION.md). Shows
// browser support, a live karaoke highlight of the target as you speak, the raw
// transcript, the running match ratio, and a PASS state at the threshold.

import { useState } from 'react'
import { Mic, MicOff, RotateCcw, Check, AlertTriangle } from 'lucide-react'
import { useSpeechMatch } from '@/hooks/useSpeechMatch'

const DEFAULT_TARGET = 'I am disciplined, focused, and consistent.'

export default function SpeechMatchTester() {
  const [target, setTarget] = useState(DEFAULT_TARGET)
  const [threshold, setThreshold] = useState(0.7)
  const sm = useSpeechMatch(target, { threshold })

  // Render the target word-by-word, lighting up matched words.
  const words = target.split(/\s+/).filter(Boolean)
  // Map display words → normalized index (the matcher works on normalized tokens,
  // which 1:1 align with non-empty display words here).
  return (
    <div className="space-y-5">
      {/* Support readout */}
      <div
        className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
          sm.supported
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
            : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
        }`}
      >
        {sm.supported ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>
          {sm.supported ? (
            <>Web Speech API supported — <code className="font-mono text-xs">{sm.api}</code>.</>
          ) : (
            <>Web Speech API <b>not supported</b> in this browser. Speak/Mirror will fall back to hold-to-affirm here.</>
          )}
        </span>
      </div>

      {/* Target + threshold */}
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Target statement</span>
          <textarea
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Pass threshold: {(threshold * 100).toFixed(0)}%
          </span>
          <input
            type="range" min={0.4} max={1} step={0.05} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>

      {/* Live karaoke highlight */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 dark:border-zinc-800">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Say it</p>
        <p className="text-xl font-bold leading-relaxed">
          {words.map((w, i) => {
            const status = sm.statuses[i] ?? 'pending'
            const color =
              status === 'matched' ? 'text-green-400'
              : status === 'missed' ? 'text-amber-400'
              : 'text-white/25'
            return (
              <span key={i} className={`transition-colors duration-100 ${color}`}>
                {w}{i < words.length - 1 ? ' ' : ''}
              </span>
            )
          })}
        </p>

        {/* Progress */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-200 ${sm.passed ? 'bg-green-400' : 'bg-violet-400'}`}
              style={{ width: `${Math.round(sm.ratio * 100)}%` }}
            />
          </div>
          <span className={`text-sm font-semibold tabular-nums ${sm.passed ? 'text-green-400' : 'text-white/70'}`}>
            {Math.round(sm.ratio * 100)}%
          </span>
        </div>
        {sm.passed && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-green-400">
            <Check className="h-4 w-4" strokeWidth={3} /> Matched — I heard you.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!sm.listening ? (
          <button
            onClick={sm.start}
            disabled={!sm.supported}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Mic className="h-4 w-4" /> Start listening
          </button>
        ) : (
          <button
            onClick={sm.stop}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-500"
          >
            <MicOff className="h-4 w-4" /> Stop
          </button>
        )}
        <button
          onClick={sm.reset}
          className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>

      {/* Diagnostics */}
      <div className="space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
        <div>
          <span className="font-semibold text-zinc-400">Heard:</span>{' '}
          <span className="italic">{sm.transcript || '—'}</span>
        </div>
        <div>
          <span className="font-semibold text-zinc-400">Matched:</span> {sm.matchedCount}/{sm.targetWords.length} words
          {sm.listening && <span className="ml-2 text-violet-400">● listening</span>}
        </div>
        {sm.error && <div className="text-amber-500">Error: {sm.error}</div>}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Optimistic highlight: <span className="text-green-500">green</span> = said (lights up to
        your furthest word; whole line greens once you pass),{' '}
        <span className="text-amber-500">amber</span> = a word behind you that wasn&apos;t caught,
        dim = not reached yet. Same engine that will power Speak &amp; Mirror; those keep a
        hold-to-affirm fallback where speech isn&apos;t supported.
      </p>
    </div>
  )
}
