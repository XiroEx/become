import { redirect } from 'next/navigation'
import AuthScreen from '../../components/AuthScreen'
import { authHref, firstQueryValue } from '../../lib/authPageMode'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ register?: string | string[]; next?: string | string[] }>
}) {
  const { register, next } = await searchParams
  const nextPath = firstQueryValue(next)

  // /login?register was the sign-up URL until sign-up got its own route, and it
  // is still in emails, bookmarks, and anywhere else outside this repo. Keep it
  // working; it just lands one hop away now.
  if (register !== undefined) redirect(authHref('register', nextPath))

  return <AuthScreen mode="login" next={nextPath} />
}
