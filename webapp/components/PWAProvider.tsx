"use client"
import React, { createContext, useContext, ReactNode } from 'react'
import { usePWA } from '../lib/usePWA'

interface PWAStatus {
  isStandalone: boolean
  isIOS: boolean
  isAndroid: boolean
  canInstall: boolean
  isServiceWorkerActive: boolean
  hasNotch: boolean
  promptInstall: () => Promise<boolean>
}

const PWAContext = createContext<PWAStatus | null>(null)

export function PWAProvider({ children }: { children: ReactNode }) {
  const pwaStatus = usePWA()

  return (
    <PWAContext.Provider value={pwaStatus}>
      {children}
    </PWAContext.Provider>
  )
}

export function usePWAContext(): PWAStatus {
  const context = useContext(PWAContext)
  if (!context) {
    throw new Error('usePWAContext must be used within a PWAProvider')
  }
  return context
}

export default PWAProvider
