import AuthForm from '../../components/AuthForm'
import Header from '../../components/Header'
import Link from 'next/link'
import PageTransition from '../../components/PageTransition'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 px-6 py-24">
      <PageTransition className="mx-auto w-full max-w-4xl">
        <div className="mb-8 w-full">
          <Header showActions={false} backButton={true} backUrl="/" />
        </div>
        <main className="mx-auto w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 p-8 shadow dark:border dark:border-zinc-800">
          <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-white">Sign in</h1>
          <AuthForm mode="login" />
        </main>
      </PageTransition>
    </div>
  )
}
