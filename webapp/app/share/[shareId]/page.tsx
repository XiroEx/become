import { notFound } from 'next/navigation'
import dbConnect from '@/lib/mongodb'
import Share from '@/models/Share'
import PublicShareView, { type SharePayloadData } from '@/components/share/PublicShareView'

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
  if (!share) notFound()
  return <PublicShareView share={share} />
}
