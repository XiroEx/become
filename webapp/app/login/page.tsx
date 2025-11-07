import AuthForm from '../../components/AuthForm'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <main className="w-full max-w-md rounded bg-white p-8 shadow">
        <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
        <AuthForm mode="login" />
        <p className="mt-4 text-sm">
          New here? <Link href="/register" className="text-foreground">Create an account</Link>
        </p>
      </main>
    </div>
  )
}
