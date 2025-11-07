import AuthForm from '../../components/AuthForm'
import Link from 'next/link'

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <main className="w-full max-w-md rounded bg-white p-8 shadow">
        <h1 className="mb-4 text-2xl font-bold">Create account</h1>
        <AuthForm mode="register" />
        <p className="mt-4 text-sm">
          Already have an account? <Link href="/login" className="text-foreground">Sign in</Link>
        </p>
      </main>
    </div>
  )
}
