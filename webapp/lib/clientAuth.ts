import { clearAllCache } from '@/lib/clientCache'

// NOTE: the credential-less `register()` / `login()` helpers that used to live
// here were deleted alongside the retirement of POST /api/auth/register and
// POST /api/auth/login (both now 410 Gone). Sign-in is passwordless magic link
// only — see app/login and lib/authBridge.ts.

export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export function logout() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('token')
  // Wipe cached dashboard data so the next user on this device can't see it.
  clearAllCache()
}
