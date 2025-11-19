import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-8 py-24 px-6">
        <Header />

        <section className="flex w-full flex-col items-center gap-6 rounded-lg bg-white p-8 shadow sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <h2 className="text-3xl font-extrabold">Train like you mean it.</h2>
            <p className="mt-3 text-lg text-zinc-700">
              Jon transformed himself to the extreme. This app gives you the programming, nutrition, chat access, and progress tracking you need to stop guessing and start getting results.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/register" className="rounded bg-foreground px-5 py-3 text-background">Get Started</Link>
              <Link href="/login" className="rounded border px-5 py-3">Sign in</Link>
            </div>
          </div>

          <div className="hidden w-80 shrink-0 sm:block">
            <div className="relative aspect-video w-full overflow-hidden rounded">
              <iframe 
                src="https://www.youtube.com/embed/ZgDz9YMYVFo?autoplay=1&mute=1&loop=1&playlist=ZgDz9YMYVFo" 
                title="YouTube video player" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                referrerPolicy="strict-origin-when-cross-origin" 
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </section>

        <section className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-900">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">Programming</h3>
              <p className="mt-2 text-sm text-zinc-600">Structured plans for strength, hypertrophy and conditioning.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-900">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">Nutrition</h3>
              <p className="mt-2 text-sm text-zinc-600">Simple, sustainable targets to fuel your training and recovery.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-900">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">Progress</h3>
              <p className="mt-2 text-sm text-zinc-600">Track lifts, measurements and photos — watch your transformation.</p>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
