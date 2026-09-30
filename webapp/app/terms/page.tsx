// PUBLIC route. Stripe expects a terms URL, and this is it. Nothing here may
// require a session: middleware.ts matches /dashboard/:path* only, so this
// page is reachable signed out, which is the point.

import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { TERMS } from '@/lib/legal/terms'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The agreement between you and Become LLC: what the Service is, subscription and automatic renewal terms, cancellation, and the health disclaimer.',
}

export default function TermsPage() {
  return <LegalDocument doc={TERMS} />
}
