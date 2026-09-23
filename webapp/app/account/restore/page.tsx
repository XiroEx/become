// PUBLIC route: the target of the "Keep my account" link in the deletion
// email. It must render for somebody with no session — requesting the deletion
// signed their device out — so it lives outside /dashboard, where middleware.ts
// would otherwise bounce it to /login.
//
// The search params are read on the SERVER and handed down, so the page has
// something to show before any JavaScript runs; the client half only exists to
// POST on a press. See RestoreClient.tsx.

import type { Metadata } from 'next'
import RestoreClient from './RestoreClient'

export const metadata: Metadata = {
  title: 'Keep your account',
  description: 'Cancel a pending deletion of your Become account.',
  // Nothing here should ever be indexed: the URL carries a one-off token.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AccountRestorePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>
}) {
  const { u, t } = await searchParams
  return <RestoreClient u={u ?? ''} t={t ?? ''} />
}
