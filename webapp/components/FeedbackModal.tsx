"use client"

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Bug, Lightbulb, MessageSquare, Check } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
}

type FeedbackType = 'bug' | 'feature' | 'general'

const typeOptions: { id: FeedbackType; label: string; Icon: typeof Bug }[] = [
  { id: 'bug', label: 'Bug', Icon: Bug },
  { id: 'feature', label: 'Feature', Icon: Lightbulb },
  { id: 'general', label: 'General', Icon: MessageSquare },
]

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('general')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLockScroll(isOpen)

  // Delay focus until modal animation completes to prevent keyboard from covering modal
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => textareaRef.current?.focus(), 500)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!message.trim() || sending) return

    setSending(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type, message }),
      })

      if (res.ok) {
        setSent(true)
        setTimeout(() => {
          handleClose()
        }, 1500)
      }
    } catch {
      // silently fail
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setType('general')
      setMessage('')
      setSent(false)
    }, 200)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 touch-none"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">Thanks for your feedback!</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Send Feedback</h2>
                  <button
                    onClick={handleClose}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Type selector */}
                <div className="mb-3 flex gap-1.5">
                  {typeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setType(opt.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        type === opt.id
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <opt.Icon className="h-3 w-3" />
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  maxLength={2000}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:bg-zinc-800"
                  ref={textareaRef}
                />

                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{message.length}/2000</span>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || sending}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
