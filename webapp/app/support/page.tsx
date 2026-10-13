// PUBLIC route. This is the "Support URL" App Store Connect requires. It must
// render signed out: a reviewer checks it without an account.

import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { SUPPORT } from '@/lib/legal/support'

export const metadata: Metadata = {
  title: 'Support',
  description:
    'How to get help with Become, what to include in your message, how to manage or cancel billing, and how to delete your account.',
}

export default function SupportPage() {
  return <LegalDocument doc={SUPPORT} />
}
