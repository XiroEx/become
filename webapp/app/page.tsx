import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-8 py-24 px-6">
        <Header />

        <section className="flex w-full flex-col items-center gap-6 rounded-lg bg-white p-8 shadow sm:flex-row sm:items-start">
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
            <Image src="/grid_preview.jpg" alt="workout preview" width={320} height={220} className="rounded object-cover" />
          </div>
        </section>

        <section className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded bg-white p-6 shadow">
            <h3 className="font-semibold">Programming</h3>
            <p className="mt-2 text-sm text-zinc-600">Structured plans for strength, hypertrophy and conditioning.</p>
          </div>
          <div className="rounded bg-white p-6 shadow">
            <h3 className="font-semibold">Nutrition</h3>
            <p className="mt-2 text-sm text-zinc-600">Simple, sustainable targets to fuel your training and recovery.</p>
          </div>
          <div className="rounded bg-white p-6 shadow">
            <h3 className="font-semibold">Progress</h3>
            <p className="mt-2 text-sm text-zinc-600">Track lifts, measurements and photos — watch your transformation.</p>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
