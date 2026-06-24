import dbConnect from '@/lib/mongodb'
import Share from '@/models/Share'
import PublicShareView, { type SharePayloadData } from '@/components/share/PublicShareView'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Become'

async function getShare(shareId: string): Promise<SharePayloadData | null> {
  await dbConnect()
  const share = await Share.findOneAndUpdate(
    { shareId },
    { $inc: { views: 1 } },
    { new: true },
  ).lean<{ kind: SharePayloadData['kind']; title: string; subtitle?: string; ownerName?: string; payload: SharePayloadData['payload']; sourceProgramId?: string } | null>()
  if (!share) return null
  return JSON.parse(JSON.stringify({
    kind: share.kind, title: share.title, subtitle: share.subtitle,
    ownerName: share.ownerName, payload: share.payload, sourceProgramId: share.sourceProgramId,
  }))
}

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  await dbConnect()
  const share = await Share.findOne({ shareId }).select('title subtitle').lean<{ title?: string; subtitle?: string } | null>()
  if (!share) return { title: `${APP_NAME} — Shared workout` }
  return {
    title: `${share.title} · ${APP_NAME}`,
    description: share.subtitle || `A workout shared on ${APP_NAME}.`,
  }
}

export default async function SharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const share = await getShare(shareId)
  if (!share) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <span className="text-lg font-black tracking-tight text-zinc-900 dark:text-white">{APP_NAME.toUpperCase()}</span>
          <Link href="/login" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-black">
            Log in
          </Link>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="text-4xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">This share link is no longer available</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">It may have expired or been removed.</p>
          <Link href="/login" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">
            Open {APP_NAME}
          </Link>
        </main>
      </div>
    )
  }
  return <PublicShareView share={share} />
}
