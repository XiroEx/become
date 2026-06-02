'use client'

import FeatureGuard from '@/components/FeatureGuard'
import MindJourney from '@/components/mind/MindJourney'
import { Brain } from 'lucide-react'

export default function MindPage() {
  return (
    <FeatureGuard
      feature="Mindset"
      description="The mind is the muscle. Train it like one. Mindset coaching is coming soon."
      icon={<Brain className="h-10 w-10" />}
    >
      <MindJourney />
    </FeatureGuard>
  )
}
