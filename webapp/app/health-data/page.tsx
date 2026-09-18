// PUBLIC route. Washington's My Health My Data Act (RCW 19.373.020) and
// Nevada's consumer health data law both require a DISTINCT consumer health
// data privacy policy with a link "prominently" published on the home page,
// so this is its own page rather than a section of /privacy. It must render
// signed out and without JavaScript, like the other legal pages.

import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { HEALTH_DATA } from '@/lib/legal/healthData'

export const metadata: Metadata = {
  title: 'Consumer Health Data Privacy Policy',
  description:
    'What consumer health data Become collects, why, who processes it, and how Washington and Nevada residents (and everyone else) can access, delete or withdraw consent to it.',
}

export default function HealthDataPage() {
  return <LegalDocument doc={HEALTH_DATA} />
}
