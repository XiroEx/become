'use client'

// CoachChat — the shared, reusable AI chat surface for every freeform consultant
// (mindset / nutrition / training). It's a full-height bottom sheet: optimistic
// user bubbles, a "thinking" state (graph replies take ~30–40s), and graceful
// degradation — when the graph is unavailable the route still returns an on-brand
// fallback reply, so the conversation never dead-ends.
//
// It POSTs to `endpoint` with { domain?, message, history, grounding, conversationId }
// and reads { reply }. One component, three surfaces.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, X, ArrowUp } from 'lucide-react'
import { runAiTask } from '@/lib/ai/runClient'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export default function CoachChat({
  endpoint,
  domain,
  title,
  subtitle,
  accentFrom = 'from-violet-500',
  accentTo = 'to-green-500',
  greeting,
  placeholder = 'Type what you’re working through…',
  grounding,
  suggestions = [],
  onClose,
}: {
  endpoint: string
  domain?: string
  title: string
  subtitle?: string
  accentFrom?: string
  accentTo?: string
  greeting: string
  placeholder?: string
  grounding?: Record<string, unknown>
  suggestions?: string[]
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: greeting }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const convoId = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c_${Date.now()}`,
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || sending) return
    const history = messages.map((m) => ({ role: m.role, text: m.text }))
    setMessages((m) => [...m, { role: 'user', text: msg }])
    setInput('')
    setSending(true)
    try {
      // Async run: POST returns a runId, runAiTask polls until the reply is ready.
      const r = await runAiTask(endpoint, { domain, message: msg, history, grounding, conversationId: convoId.current })
      const reply = (r.text && r.text.trim()) || (r.reply && r.reply.trim())
        || 'I had trouble reaching the coach just now — try that again in a moment.'
      setMessages((m) => [...m, { role: 'assistant', text: reply }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Connection hiccup — give that another try in a sec.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-0 z-[201] flex h-[88vh] flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-100 px-5 pb-3 pt-3 dark:border-zinc-800">
          <div className="flex justify-center pb-3">
            <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${accentFrom} ${accentTo} text-white`}>
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-base font-bold leading-tight text-zinc-900 dark:text-white">{title}</p>
                {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'rounded-br-md bg-zinc-900 text-white dark:bg-white dark:text-black'
                    : 'rounded-bl-md bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-500"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
                <span className="ml-1 text-xs text-zinc-400">thinking…</span>
              </div>
            </div>
          )}

          {/* First-turn suggestion chips */}
          {messages.length === 1 && suggestions.length > 0 && !sending && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          className="shrink-0 border-t border-zinc-100 px-3 pt-2.5 dark:border-zinc-800"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 0.625rem)' }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              placeholder={placeholder}
              className="max-h-32 flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              aria-label="Send"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${accentFrom} ${accentTo} text-white transition-opacity disabled:opacity-40`}
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}
