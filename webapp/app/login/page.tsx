"use client"

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AuthForm from '../../components/AuthForm'
import Header from '../../components/Header'
import Link from 'next/link'
import PageTransition from '../../components/PageTransition'
import { getAuthPageCopy } from '../../lib/authPageMode'

function LoginContent() {
  const searchParams = useSearchParams()
  const copy = getAuthPageCopy(searchParams)

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 px-6 py-24">
      <PageTransition className="mx-auto w-full max-w-4xl">
        <div className="mb-8 w-full">
          <Header showActions={false} backButton={true} backUrl="/" />
        </div>
        <main className="mx-auto w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 p-8 shadow dark:border dark:border-zinc-800">
          <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white">{copy.heading}</h1>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtext}</p>
          <AuthForm mode={copy.mode} />
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            {copy.toggleQuestion}{' '}
            <Link href={copy.toggleHref} className="text-foreground dark:text-white font-medium">
              {copy.toggleLabel}
            </Link>
          </p>
        </main>
      </PageTransition>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
