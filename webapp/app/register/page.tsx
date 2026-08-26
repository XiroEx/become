import { redirect } from 'next/navigation'

export default async function RegisterRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  redirect(next ? `/login?register&next=${encodeURIComponent(next)}` : '/login?register')
}
