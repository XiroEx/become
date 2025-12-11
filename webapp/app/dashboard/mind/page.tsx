import PageTransition from '@/components/PageTransition'

export default function MindPage() {
  return (
    <PageTransition className="space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Mind</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Mental wellness and mindfulness resources.</p>
      </header>

      <div className="grid gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-white">Meditation</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Guided meditation sessions to help you stay focused and reduce stress.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-white">Sleep</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Track your sleep patterns and get tips for better rest.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-white">Motivation</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Daily motivation and mindset coaching to keep you on track.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-white">Journal</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Reflect on your journey and track your mental wellness progress.
          </p>
        </div>
      </div>
    </PageTransition>
  )
}
