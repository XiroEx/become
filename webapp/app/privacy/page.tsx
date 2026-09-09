// PUBLIC route. This is the "Privacy Policy URL" App Store Connect requires,
// and the page CalOPPA requires for a site that collects personal information
// from Californians. It must render signed out and without JavaScript.

import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { PRIVACY } from '@/lib/legal/privacy'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What Become collects, why, who processes it, how long it is kept, and how to access, correct, export or delete it.',
}

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY} />
}
