'use client'

// Mounts the redTutorial provider for the signed-in app shell: registers the
// BECOME onboarding tour, feeds route changes to the engine, and persists
// progress per ACCOUNT via /api/tutorial-progress (localStorage is only the
// offline fallback), so tours don't replay on every device.

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import {
  TutorialProvider,
  createFetchAdapter,
  createLocalStorageAdapter,
  type TutorialTheme,
} from '@redbtn/redtutorial'
import { getToken } from '@/lib/clientAuth'
import { becomeTutorials } from '@/lib/tutorials/becomeTour'

// BECOME's tutorial look: a darker spotlight backdrop for stronger contrast, and
// black primary buttons (the library default accent is red) to match the app.
const becomeTutorialTheme: TutorialTheme = {
  overlayOpacity: 0.85,
  accent: '#000000',
  accentFg: '#ffffff',
}

export default function TutorialRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Stable per mount — TutorialRoot lives inside AuthGuard, so a token exists
  // by the time this mounts; if it somehow doesn't, requests fail closed and
  // the localStorage fallback still keeps the tour single-shot on this device.
  const storage = useMemo(() => {
    const fallback = createLocalStorageAdapter('become:tutorial-progress')
    const token = getToken()
    if (!token) return fallback
    return createFetchAdapter({
      url: '/api/tutorial-progress',
      headers: { Authorization: `Bearer ${token}` },
      fallback,
    })
  }, [])

  return (
    <TutorialProvider
      tutorials={becomeTutorials}
      storage={storage}
      path={pathname}
      theme={becomeTutorialTheme}
    >
      {children}
    </TutorialProvider>
  )
}
