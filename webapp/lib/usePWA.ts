"use client"
import { useState, useEffect } from 'react'

interface PWAStatus {
  /** Whether the app is running as an installed PWA (standalone mode) */
  isStandalone: boolean
  /** Whether the app is running on iOS */
  isIOS: boolean
  /** Whether the app is running on Android */
  isAndroid: boolean
  /** Whether the app can be installed (has install prompt available) */
  canInstall: boolean
  /** Whether the service worker is registered and active */
  isServiceWorkerActive: boolean
  /** Whether the device has a notch or curved screen edges */
  hasNotch: boolean
  /** Trigger the install prompt if available */
  promptInstall: () => Promise<boolean>
}

// Store the deferred prompt globally so it persists across re-renders
let deferredPrompt: BeforeInstallPromptEvent | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWA(): PWAStatus {
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [canInstall, setCanInstall] = useState(false)
  const [isServiceWorkerActive, setIsServiceWorkerActive] = useState(false)
  const [hasNotch, setHasNotch] = useState(false)

  useEffect(() => {
    // Detect standalone mode (PWA)
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://')
      
      setIsStandalone(isStandaloneMode)
    }

    // Detect platform
    const checkPlatform = () => {
      const userAgent = window.navigator.userAgent.toLowerCase()
      const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const isAndroidDevice = /android/.test(userAgent)
      
      setIsIOS(isIOSDevice)
      setIsAndroid(isAndroidDevice)
    }

    // Detect notch/safe areas
    const checkNotch = () => {
      // Check if safe-area-inset values are non-zero
      const root = document.documentElement
      const safeAreaTop = getComputedStyle(root).getPropertyValue('--sat').trim()
      const safeAreaBottom = getComputedStyle(root).getPropertyValue('--sab').trim()
      
      // Also check via CSS environment variables directly
      const testElement = document.createElement('div')
      testElement.style.paddingTop = 'env(safe-area-inset-top)'
      document.body.appendChild(testElement)
      const computedPadding = getComputedStyle(testElement).paddingTop
      document.body.removeChild(testElement)
      
      const hasTopNotch = computedPadding !== '0px' && computedPadding !== ''
      const hasBottomNotch = safeAreaBottom !== '0px' && safeAreaBottom !== ''
      
      setHasNotch(hasTopNotch || hasBottomNotch)
    }

    // Check service worker status
    const checkServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        setIsServiceWorkerActive(!!registration?.active)
      }
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }

    // Listen for successful install
    const handleAppInstalled = () => {
      deferredPrompt = null
      setCanInstall(false)
      setIsStandalone(true)
    }

    checkStandalone()
    checkPlatform()
    checkNotch()
    checkServiceWorker()

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    mediaQuery.addEventListener('change', checkStandalone)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      mediaQuery.removeEventListener('change', checkStandalone)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      deferredPrompt = null
      setCanInstall(false)
      return outcome === 'accepted'
    } catch {
      return false
    }
  }

  return {
    isStandalone,
    isIOS,
    isAndroid,
    canInstall,
    isServiceWorkerActive,
    hasNotch,
    promptInstall,
  }
}

/**
 * Context provider for PWA status - use this if you need PWA status in many components
 */
export { usePWA as default }
