import Link from 'next/link'
import PageTransition from '@/components/PageTransition'

export default function DashboardPage() {
  return (
    <PageTransition className="space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Dashboard</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Welcome back to your fitness journey.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Link 
          href="/dashboard/programming" 
          className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Current Program</h2>
          <p className="text-zinc-500 dark:text-zinc-400">View your active workout plan and today's exercises.</p>
        </Link>

        <Link 
          href="/dashboard/nutrition" 
          className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Nutrition</h2>
          <p className="text-zinc-500 dark:text-zinc-400">Track your meals and monitor your macros.</p>
        </Link>

        <Link 
          href="/dashboard/progress" 
          className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Progress Tracking</h2>
          <p className="text-zinc-500 dark:text-zinc-400">Check your stats, weight history, and achievements.</p>
        </Link>

        <Link 
          href="/dashboard/chat" 
          className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">AI Coach</h2>
          <p className="text-zinc-500 dark:text-zinc-400">Chat with your personal AI fitness assistant.</p>
        </Link>
      </div>
    </PageTransition>
  )
}
