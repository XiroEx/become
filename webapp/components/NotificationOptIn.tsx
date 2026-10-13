'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff, Check, X } from 'lucide-react'
import {
  DENIED_AT_KEY,
  REPROMPT_SHOWN_AT_KEY,
  parseStoredTimestamp,
  resolveDeniedAt,
  shouldShowDeniedReprompt,
} from '@/lib/push/reprompt'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const DISMISSED_KEY = 'notification_prompt_dismissed_at'
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

type PromptMode = 'opt-in' | 'denied'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export default function NotificationOptIn() {
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<PromptMode>('opt-in')
  const [subscribing, setSubscribing] = useState(false)
  const [enabled, setEnabled] = useState(false)

  // Note: users who ALREADY granted permission never reach this prompt. Keeping
  // their subscription alive is PushSubscriptionSync's job, mounted in the
  // dashboard layout.
  useEffect(() => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window) ||
      !VAPID_PUBLIC_KEY
    ) return

    const permission = Notification.permission

    if (permission === 'granted') {
      // Permission is on. Clear any denial bookkeeping so that IF the user
      // blocks notifications again later, the 7-day/monthly cadence restarts
      // from that fresh denial instead of resuming a stale one.
      localStorage.removeItem(DENIED_AT_KEY)
      localStorage.removeItem(REPROMPT_SHOWN_AT_KEY)
      return
    }

    if (permission === 'denied') {
      const now = Date.now()
      const deniedAt = resolveDeniedAt(localStorage.getItem(DENIED_AT_KEY), now)
      localStorage.setItem(DENIED_AT_KEY, String(deniedAt))

      const lastShownAt = parseStoredTimestamp(localStorage.getItem(REPROMPT_SHOWN_AT_KEY))
      if (!shouldShowDeniedReprompt(deniedAt, lastShownAt, now)) return

      // Delay so it doesn't pop immediately on load
      const t = setTimeout(() => {
        localStorage.setItem(REPROMPT_SHOWN_AT_KEY, String(Date.now()))
        setMode('denied')
        setShow(true)
      }, 3000)
      return () => clearTimeout(t)
    }

    // permission === 'default'
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY))
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return

    const t = setTimeout(() => {
      setMode('opt-in')
      setShow(true)
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString())
    setShow(false)
  }

  const subscribe = async () => {
    setSubscribing(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setShow(false)
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      })

      const token = localStorage.getItem('token')
      if (!token) {
        setShow(false)
        return
      }

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platform: 'web',
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
            auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
          },
        }),
      })

      // Show a brief success state inside the card before hiding it.
      setEnabled(true)
      setTimeout(() => setShow(false), 1800)
    } catch (err) {
      console.warn('Push subscription failed:', err)
      setShow(false)
    } finally {
      setSubscribing(false)
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed bottom-28 left-4 right-4 z-[70] mx-auto max-w-sm rounded-2xl bg-zinc-900 p-4 shadow-xl dark:bg-zinc-800 sm:left-auto sm:right-6 sm:w-80"
        >
          {mode === 'denied' ? (
            <>
              <button
                onClick={() => setShow(false)}
                className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-200"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-700">
                  <BellOff className="h-4 w-4 text-white" />
                </div>
                <p className="text-sm font-semibold text-white">Notifications are blocked</p>
              </div>

              <p className="mb-4 text-xs leading-relaxed text-zinc-400">
                You won&rsquo;t get streak or workout reminders. Enable notifications for Become
                in your browser or device settings to turn them back on.
              </p>

              <button
                onClick={() => setShow(false)}
                className="w-full rounded-xl bg-zinc-700 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
              >
                Got it
              </button>
            </>
          ) : enabled ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600">
                <Check className="h-5 w-5 text-white" />
              </div>
              <p className="text-sm font-semibold text-white">You&rsquo;re all set!</p>
              <p className="text-xs text-zinc-400">Notifications enabled.</p>
            </div>
          ) : (
            <>
              <button
                onClick={dismiss}
                className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-200"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                  <Bell className="h-4 w-4 text-white" />
                </div>
                <p className="text-sm font-semibold text-white">Stay on your streak</p>
              </div>

              <p className="mb-4 text-xs leading-relaxed text-zinc-400">
                Get a nudge when your streak is at risk and a reminder when you have a workout scheduled.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={subscribe}
                  disabled={subscribing}
                  className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {subscribing ? 'Enabling…' : 'Enable'}
                </button>
                <button
                  onClick={dismiss}
                  className="flex items-center gap-1.5 rounded-xl bg-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
                >
                  <BellOff className="h-3.5 w-3.5" />
                  Not now
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
