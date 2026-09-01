import { NextResponse } from 'next/server'

/** Single response shape for retired credential-less auth endpoints. */
export function legacyAuthGone(): NextResponse {
  return NextResponse.json(
    {
      error: 'This endpoint has been retired. Become uses passwordless magic-link sign-in.',
      code: 'legacy_auth_disabled',
      use: '/api/auth/send-link',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
