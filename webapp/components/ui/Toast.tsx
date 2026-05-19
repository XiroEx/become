'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'neutral' | 'info'

export interface ToastData {
  message: string
  type: ToastType
}

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  neutral: 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900',
  info: 'bg-blue-600 text-white',
}

const TYPE_ICON: Record<ToastType, typeof Check> = {
  success: Check,
  error: AlertCircle,
  neutral: Info,
  info: Info,
}

/**
 * A single floating toast pinned bottom-center above the bottom nav.
 * Slides up 8px + fades in on mount, fades out on unmount. z-[80] so it
 * sits above most modals.
 */
export default function Toast({ toast }: { toast: ToastData | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 left-1/2 z-[80] w-max max-w-xs -translate-x-1/2 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${TYPE_STYLES[toast.type]}`}
        >
          {(() => {
            const Icon = TYPE_ICON[toast.type]
            return (
              <Icon
                className={`h-4 w-4 shrink-0 ${toast.type === 'neutral' ? 'text-current' : 'text-white'}`}
              />
            )
          })()}
          <span>{toast.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
