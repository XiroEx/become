// NP-205: the pure decision behind components/GetAppBanner.tsx — whether to
// show the dismissible "Get the app" prompt. Separated from the component so
// it is testable without jsdom/testing-library (this repo has neither; see
// AGENTS.md and the precedent in tests/unit/dumbbellWeight.test.ts).
//
// iOS gets Safari's own smart banner instead (the apple-itunes-app meta tag,
// app/layout.tsx's generateMetadata), so this is Android-only — the component
// never renders for 'ios' or 'other' (desktop).

import type { DeviceOS } from './deviceOS'

export interface GetAppBannerState {
  os: DeviceOS
  /** Opened by the native app's in-app browser — see lib/nativeBrowserMarker.ts. */
  openedByNativeApp: boolean
  /** The member already dismissed it on this browser. */
  dismissed: boolean
  /** The Play Store URL, from GET /api/app/config. Absent means not configured yet. */
  storeUrl?: string
}

export function shouldShowGetAppBanner(state: GetAppBannerState): boolean {
  if (state.openedByNativeApp) return false
  if (state.dismissed) return false
  if (state.os !== 'android') return false
  if (!state.storeUrl) return false
  return true
}
