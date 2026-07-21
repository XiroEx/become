import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The standalone Arsenal view is hidden for now — its segments live in the hub's
// Training Grounds (shown after the daily session). Anyone landing here (old
// links, tour) goes to the Mind hub.
export default function ArsenalPage() {
  redirect('/dashboard/mind')
}
