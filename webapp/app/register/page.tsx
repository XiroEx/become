import AuthScreen from '../../components/AuthScreen'
import { firstQueryValue } from '../../lib/authPageMode'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  return <AuthScreen mode="register" next={firstQueryValue(next)} />
}
