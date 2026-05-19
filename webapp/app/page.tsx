"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "BECOME";
const logo = process.env.NEXT_PUBLIC_LOGO || "/logo.png";
const profileImage = process.env.NEXT_PUBLIC_PROFILE_IMAGE || "/profile.png";

const PHRASES = ["Stronger", "Unstoppable", "Disciplined", "Your Best", "Relentless"];

function PhoneFrame({ src, alt, label }: { src: string; alt: string; label: string }) {
  return (
    <div className="shrink-0 snap-center flex flex-col items-center gap-4">
      <div className="rounded-[2.8rem] bg-zinc-950 p-1.5 shadow-[0_30px_80px_rgba(0,0,0,0.7)] ring-1 ring-white/8">
        <div className="overflow-hidden rounded-[2.3rem] w-[200px]">
          <Image src={src} alt={alt} width={390} height={844} className="w-full h-auto block" unoptimized />
        </div>
      </div>
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-600">{label}</span>
    </div>
  );
}

export default function Home() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("token"));
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">

      {/* NAV */}
      <nav className="fixed top-0 z-50 w-full border-b border-zinc-900 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src={logo} alt={appName} width={32} height={32} className="rounded-full object-cover" />
            <span className="text-base font-bold tracking-tight">{appName}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href={isLoggedIn ? "/dashboard" : "/login"} className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">
              {isLoggedIn ? "Dashboard" : "Sign In"}
            </Link>
            <Link href="/register" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-16 text-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-7">
          <Image src={logo} alt={appName} width={80} height={80} className="rounded-full object-cover mx-auto" priority />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="text-5xl font-black tracking-tight sm:text-7xl">
          Train to {appName}
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="mt-3 h-9 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={phraseIndex}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="text-2xl font-bold text-zinc-300"
            >
              {PHRASES[phraseIndex]}
            </motion.p>
          </AnimatePresence>
        </motion.div>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-6 max-w-sm text-base text-zinc-500 leading-relaxed">
          Structured programs, real progress tracking, mindset work, and direct coaching — all in one place.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }} className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/register" className="rounded-full bg-white px-8 py-3.5 text-center font-semibold text-black transition-colors hover:bg-zinc-200">
            Start Your Transformation
          </Link>
          <Link href={isLoggedIn ? "/dashboard" : "/login"} className="text-sm font-medium text-zinc-500 transition-colors hover:text-white">
            {isLoggedIn ? "Go to Dashboard →" : "Already a member? Sign In →"}
          </Link>
        </motion.div>
      </section>

      {/* SCREENSHOT CAROUSEL */}
      <section className="w-full py-16 overflow-hidden bg-black">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-12 px-6">
          What&apos;s inside
        </p>
        <div className="flex gap-8 overflow-x-auto snap-x snap-mandatory pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-[max(32px,calc(50vw-420px))]">
          <PhoneFrame src="/screenshots/ss-dashboard.png" alt="Dashboard" label="Home" />
          <PhoneFrame src="/screenshots/ss-programming.png" alt="Programs" label="Programs" />
          <PhoneFrame src="/screenshots/ss-mind.png" alt="Mindset" label="Mindset" />
          <PhoneFrame src="/screenshots/ss-nutrition.png" alt="Nutrition" label="Nutrition" />
        </div>
        <p className="text-center text-xs text-zinc-700 mt-2 sm:hidden">swipe to explore →</p>
      </section>

      {/* PROGRAMS */}
      <section className="w-full bg-zinc-950 py-20 px-6">
        <div className="mx-auto max-w-4xl flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-20">
          <div className="lg:flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-500 mb-4">Programming</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Programs that actually work.</h2>
            <p className="mt-4 text-zinc-500 leading-relaxed text-sm">
              Not cookie-cutter templates. Every program is built around real training methodology — structured phases, progressive overload baked in, and workouts that deliver results when you show up consistently.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Strength, hypertrophy, conditioning, and hybrid programs",
                "Multi-phase structure with built-in progressive overload",
                "Swap exercises instantly if you're missing equipment",
                "Live workout tracker — log sets, reps, and weight in real time",
                "Track PRs per exercise and see your full strength history",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-zinc-400">
                  <span className="text-green-500 shrink-0 mt-0.5 font-bold">—</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:flex-1 flex justify-center lg:justify-end">
            <div className="rounded-[2.8rem] bg-black p-1.5 shadow-[0_30px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
              <div className="overflow-hidden rounded-[2.3rem] w-[220px]">
                <Image src="/screenshots/ss-programming.png" alt="Programs" width={390} height={844} className="w-full h-auto" unoptimized />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MINDSET */}
      <section className="w-full bg-black py-20 px-6">
        <div className="mx-auto max-w-4xl flex flex-col gap-12 lg:flex-row-reverse lg:items-center lg:gap-20">
          <div className="lg:flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-4">Mindset</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">The mind is the muscle.</h2>
            <p className="mt-4 text-zinc-500 leading-relaxed text-sm">
              Most apps ignore the mental side of training. Become treats mindset as a core pillar. Daily check-ins, streaks that reward consistency, and frameworks designed to keep you resilient when motivation runs out.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Daily mood check-ins tied to your training and nutrition data",
                "Streak system with milestone rewards and freeze days",
                "Mindset frameworks to stay consistent long-term",
                "Correlate your mood with how you perform in the gym",
                "Built-in accountability so you can't slip quietly",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-zinc-400">
                  <span className="text-purple-400 shrink-0 mt-0.5 font-bold">—</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:flex-1 flex justify-center lg:justify-start">
            <div className="rounded-[2.8rem] bg-zinc-950 p-1.5 shadow-[0_30px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
              <div className="overflow-hidden rounded-[2.3rem] w-[220px]">
                <Image src="/screenshots/ss-mind.png" alt="Mindset" width={390} height={844} className="w-full h-auto" unoptimized />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NUTRITION */}
      <section className="w-full bg-zinc-950 py-20 px-6">
        <div className="mx-auto max-w-4xl flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-20">
          <div className="lg:flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-400 mb-4">Nutrition</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Fuel the work.</h2>
            <p className="mt-4 text-zinc-500 leading-relaxed text-sm">
              Simple, sustainable targets based on your stats and goals. Track macros without the obsession — know your numbers, hit them consistently, and let the results compound over time.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Personalized macro targets built around your profile and goal",
                "Food search with barcode scanning and a growing database",
                "Daily calorie ring with protein, carbs, and fat breakdown",
                "Tracks alongside your training data and mood check-ins",
                "Simple enough to actually use — no spreadsheet required",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-zinc-400">
                  <span className="text-orange-400 shrink-0 mt-0.5 font-bold">—</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:flex-1 flex justify-center lg:justify-end">
            <div className="rounded-[2.8rem] bg-black p-1.5 shadow-[0_30px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
              <div className="overflow-hidden rounded-[2.3rem] w-[220px]">
                <Image src="/screenshots/ss-nutrition.png" alt="Nutrition" width={390} height={844} className="w-full h-auto" unoptimized />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="w-full bg-black py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 text-center mb-12">Real People. Real Results.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                quote: "Finally a program that makes sense. No BS, just results. Down 20lbs and stronger than ever.",
                name: "Mike T.",
                tag: "12-week transformation",
              },
              {
                quote: "The nutrition guidance changed everything. Simple targets I could actually follow. Absolute game changer.",
                name: "Sarah K.",
                tag: "8-week transformation",
              },
              {
                quote: "Having direct access for questions was huge. No more second-guessing. Just execute and grow.",
                name: "James R.",
                tag: "16-week transformation",
              },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl bg-zinc-950 p-6 flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 pt-5 border-t border-zinc-900">
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{t.tag}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COACH */}
      <section className="w-full bg-zinc-950 py-20 px-6">
        <div className="mx-auto max-w-3xl flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-10">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full">
            <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
          </div>
          <div>
            <p className="text-lg font-medium text-white leading-relaxed">
              &ldquo;I built this because I wanted one place that handles everything — programs, nutrition, mindset, and the ability to actually talk to your coach. Stop juggling five apps. Just BECOME.&rdquo;
            </p>
            <p className="mt-3 text-sm text-zinc-600">Jon Don · Founder &amp; Coach</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full bg-black py-24 px-6 text-center">
        <div className="mx-auto max-w-xl">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">Start becoming.</h2>
          <p className="mt-4 text-base text-zinc-500 leading-relaxed">
            Programs. Nutrition. Mindset. Coaching. Everything you need to become the greatest version of yourself — in one place.
          </p>
          <Link href="/register" className="mt-8 inline-block rounded-full bg-white px-10 py-4 font-semibold text-black transition-colors hover:bg-zinc-200">
            Get Started Free
          </Link>
          <p className="mt-4 text-xs text-zinc-700">No credit card required to start.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full border-t border-zinc-900 bg-black py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src={logo} alt={appName} width={22} height={22} className="rounded-full object-cover" />
            <span className="text-sm font-semibold">{appName}</span>
          </div>
          <p className="text-xs text-zinc-700">&copy; {new Date().getFullYear()} {appName}. All rights reserved.</p>
          <div className="flex gap-5 text-xs text-zinc-600">
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
