'use client'

import MindJourney from '@/components/mind/MindJourney'

// Mindset used to be admin-gated by FeatureGuard while the session engine
// stabilized (see nutrition/page.tsx's identical unlock — commit 8ab03ea).
// It's been live and stable for a while now, so it renders for every authed
// user like the rest of the dashboard instead of only role === "admin".
export default function MindPage() {
  return <MindJourney />
}
