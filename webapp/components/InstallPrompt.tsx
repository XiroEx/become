"use client"
import React, { useState, useEffect } from 'react'
import { X, Download, Share } from 'lucide-react'
import { usePWA } from '../lib/usePWA'

export default function InstallPrompt() {
  const { isStandalone, isIOS, canInstall, promptInstall } = usePWA()
  const [dismissed, setDismissed] = useState(true) // Start hidden
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    // Check if user has previously dismissed the prompt
    const wasDismissed = localStorage.getItem('pwa-install-dismissed')
    if (wasDismissed) {
      const dismissedTime = parseInt(wasDismissed, 10)
      // Show again after 7 days
      if (Date.now() - dismissedTime > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('pwa-install-dismissed')
        setDismissed(false)
      }
    } else {
      setDismissed(false)
    }
  }, [])

  // Don't show if already installed, dismissed, or can't install (and not iOS)
  if (isStandalone || dismissed || (!canInstall && !isIOS)) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSInstructions(true)
      return
    }

    const accepted = await promptInstall()
    if (accepted) {
      setDismissed(true)
    }
  }

  return (
    <>
      <div 
        className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        style={{
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <button
          onClick={handleDismiss}
          className="absolute right-2 top-2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          aria-label="Dismiss"
        >
          <X className="h-5 w-5" />
        </button>
        
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 dark:from-zinc-100 dark:to-zinc-200">
            <Download className="h-5 w-5 text-white dark:text-zinc-900" />
          </div>
          
          <div className="flex-1 pr-6">
            <h3 className="font-semibold text-zinc-900 dark:text-white">
              Install App
            </h3>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              {isIOS 
                ? "Add to your home screen for the best experience" 
                : "Install for quick access and offline support"
              }
            </p>
            
            <button
              onClick={handleInstall}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              {isIOS ? (
                <>
                  <Share className="h-4 w-4" />
                  How to Install
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Install
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* iOS Installation Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div 
            className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-800"
            style={{
              marginBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Install on iOS
            </h3>
            <ol className="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-900 dark:bg-zinc-700 dark:text-white">
                  1
                </span>
                <span>
                  Tap the <Share className="inline h-4 w-4" /> Share button in Safari
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-900 dark:bg-zinc-700 dark:text-white">
                  2
                </span>
                <span>Scroll down and tap &quot;Add to Home Screen&quot;</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-900 dark:bg-zinc-700 dark:text-white">
                  3
                </span>
                <span>Tap &quot;Add&quot; to confirm</span>
              </li>
            </ol>
            <button
              onClick={() => setShowIOSInstructions(false)}
              className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
