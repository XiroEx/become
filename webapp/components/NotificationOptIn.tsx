'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, X } from 'lucide-react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const DISMISSED_KEY = 'notification_prompt_dismissed'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export default function NotificationOptIn() {
  const [show, setShow] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    // Don't show if: no SW support, no VAPID key, already granted/denied, or dismissed this session
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !VAPID_PUBLIC_KEY ||
      Notification.permission !== 'default' ||
      sessionStorage.getItem(DISMISSED_KEY)
    ) return

    // Delay so it doesn't pop immediately on load
    const t = setTimeout(() => setShow(true), 3000)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
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
      if (!token) return

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

      setShow(false)
    } catch (err) {
      console.warn('Push subscription failed:', err)
      setShow(false)
    } finally {
      setSubscribing(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-sm rounded-2xl bg-zinc-900 p-4 shadow-xl dark:bg-zinc-800 sm:left-auto sm:right-6 sm:w-80">
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
    </div>
  )
}
