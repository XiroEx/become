import { Suspense } from 'react'
import BecomingClient from './BecomingClient'

export const dynamic = 'force-dynamic'

export default function BecomingPage() {
  return (
    <Suspense fallback={null}>
      <BecomingClient />
    </Suspense>
  )
}
