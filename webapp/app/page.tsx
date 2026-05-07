"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";
import PhoneMockup from "@/components/PhoneMockup";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Become";
const logo = process.env.NEXT_PUBLIC_LOGO || "/logo.png";
const profileImage = process.env.NEXT_PUBLIC_PROFILE_IMAGE || "/profile.png";

const PHRASES = [
  "Stronger",
  "Unstoppable",
  "Disciplined",
  "Your Best",
  "Relentless",
];

const MILESTONES = [7, 14, 30, 60, 100];

export default function Home() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [streakCount, setStreakCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("token"));
  }, []);

  // Animate streak counter up for visual effect
  useEffect(() => {
    let frame: number;
    let start = 0;
    const target = 23;
    const step = () => {
      start += 1;
      setStreakCount(start);
      if (start < target) frame = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => { frame = requestAnimationFrame(step); }, 800);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">

      {/* ── NAV ─────────────────────────────────────────── */}
      <nav className="fixed top-0 z-50 w-full border-b border-zinc-800/60 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src={logo} alt={appName} width={36} height={36} className="rounded-full object-cover" />
            <span className="text-lg font-bold tracking-tight">{appName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={isLoggedIn ? "/dashboard" : "/login"}
              className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-medium text-zinc-300 transition-all hover:border-zinc-400 hover:text-white"
            >
              {isLoggedIn ? "Dashboard" : "Log In"}
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────── */}
      <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-8 relative"
        >
          <div className="relative h-28 w-28 overflow-hidden rounded-full ring-2 ring-zinc-700 shadow-2xl">
            <Image src={logo} alt={appName} fill className="object-cover" priority />
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-xs font-bold shadow-lg">
            ✓
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl font-black tracking-tight sm:text-7xl"
        >
          {appName}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative mt-4 h-12 w-full max-w-xs"
        >
          <p className="text-base text-zinc-500 mb-1">Train to Become</p>
          <AnimatePresence mode="wait">
            <motion.span
              key={phraseIndex}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="absolute inset-x-0 text-2xl font-bold text-white"
            >
              {PHRASES[phraseIndex]}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 max-w-xl text-lg text-zinc-400"
        >
          Structured training programs, smart progress tracking, and direct coaching — built around you.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Link
            href="/register"
            className="rounded-full bg-white px-8 py-4 text-center font-semibold text-black transition-all hover:bg-zinc-200 hover:scale-105 active:scale-100"
          >
            Start Your Transformation
          </Link>
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="rounded-full border border-zinc-700 px-8 py-4 text-center font-medium text-zinc-300 transition-all hover:border-zinc-400 hover:text-white"
          >
            {isLoggedIn ? "Go to Dashboard" : "Sign In"}
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </motion.div>
      </section>

      {/* ── TRANSFORMATION VIDEO ────────────────────────── */}
      <section className="w-full bg-zinc-950 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
            <AnimatedSection direction="left" className="flex-1 text-center lg:text-left">
              <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">The Story</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl lg:text-5xl">
                Train like you<br />
                <span className="text-zinc-400">mean it.</span>
              </h2>
              <p className="mt-5 text-lg text-zinc-400">
                Jon transformed himself from the ground up — and built this app to give you the exact programming, nutrition guidance, and accountability he used to do it. No templates. No guessing. Just results.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <div className="relative h-12 w-12 overflow-hidden rounded-full ring-2 ring-zinc-700">
                  <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
                </div>
                <div>
                  <div className="font-semibold">Jon Don</div>
                  <div className="text-sm text-zinc-500">Founder &amp; Coach</div>
                </div>
              </div>
            </AnimatedSection>
            <AnimatedSection direction="right" className="w-full max-w-lg lg:flex-1">
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl shadow-2xl">
                <iframe
                  src="https://www.youtube.com/embed/ZgDz9YMYVFo?autoplay=1&mute=1&loop=1&playlist=ZgDz9YMYVFo"
                  title="Transformation Journey"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ───────────────────────────────── */}
      <section className="w-full bg-black py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Everything You Need</h2>
            <p className="mt-3 text-lg text-zinc-400">One platform. Total transformation.</p>
          </AnimatedSection>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                ),
                title: "Programming",
                desc: "Structured plans for strength, hypertrophy, and conditioning.",
                delay: 0,
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                ),
                title: "Nutrition",
                desc: "Simple, sustainable targets to fuel training and recovery.",
                delay: 0.1,
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                ),
                title: "Mindset",
                desc: "Mental frameworks to stay consistent and resilient long-term.",
                delay: 0.2,
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                ),
                title: "Coaching Chat",
                desc: "Direct access to guidance when you need it. No guessing.",
                delay: 0.3,
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                ),
                title: "Progress",
                desc: "Track lifts, measurements, and mood. See your transformation.",
                delay: 0.4,
              },
            ].map((feature) => (
              <AnimatedSection key={feature.title} delay={feature.delay} direction="up">
                <div className="group flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-all hover:border-zinc-600 hover:bg-zinc-800">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
                    <svg className="h-6 w-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {feature.icon}
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{feature.title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{feature.desc}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── STREAK SYSTEM ───────────────────────────────── */}
      <section className="w-full bg-zinc-950 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
            <AnimatedSection direction="left" className="flex-1">
              <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Consistency</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                Stay Consistent.<br />Get Rewarded.
              </h2>
              <p className="mt-4 text-lg text-zinc-400">
                Building a habit is the hardest part. The streak system tracks every workout, weight log, and check-in — rewarding you for showing up day after day with milestones that matter.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  { label: "Daily streaks", desc: "Every action extends your streak — workouts, weigh-ins, mood logs" },
                  { label: "Streak freezes", desc: "Life happens. Earn freezes to protect your streak on rest days" },
                  { label: "Milestones", desc: "Hit 7, 14, 30, 60, and 100-day milestones for real recognition" },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                    </div>
                    <span className="text-zinc-300">
                      <strong className="text-white">{item.label}</strong> — {item.desc}
                    </span>
                  </li>
                ))}
              </ul>
            </AnimatedSection>

            <AnimatedSection direction="right" className="flex-1 flex justify-center">
              {/* Streak UI mockup */}
              <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-zinc-800">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-4 py-2 text-orange-400 border border-orange-500/20">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-semibold">Active Streak</span>
                  </div>
                  <div className="mt-4 text-7xl font-black text-white">{streakCount}</div>
                  <div className="text-zinc-400">days in a row</div>
                </div>

                <div className="mt-6 flex justify-between">
                  {MILESTONES.map((m) => (
                    <div key={m} className="flex flex-col items-center gap-1">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold border-2 transition-all ${
                        streakCount >= m
                          ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/30"
                          : "border-zinc-700 text-zinc-600"
                      }`}>
                        {m}
                      </div>
                      <span className="text-xs text-zinc-600">{m}d</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div
                      key={i}
                      className={`aspect-square rounded-sm transition-colors ${
                        i < streakCount
                          ? i < 7 ? "bg-orange-400" : i < 14 ? "bg-orange-500" : "bg-orange-600"
                          : "bg-zinc-800"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-zinc-600">Last 28 days activity</p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── PROGRAMMING DEEP DIVE ────────────────────────── */}
      <section className="w-full bg-black py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
            <AnimatedSection direction="left" className="flex-1">
              <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Programming</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                Proven Programs That<br />Deliver Results
              </h2>
              <p className="mt-4 text-lg text-zinc-400">
                No cookie-cutter templates. Every program is built from real-world experience — structured phases, progressive overload, and workouts that actually work.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  { label: "Strength Programs", desc: "Build raw power with progressive overload" },
                  { label: "Hypertrophy Programs", desc: "Maximize muscle growth with volume training" },
                  { label: "Conditioning Programs", desc: "Improve endurance and work capacity" },
                  { label: "Hybrid Programs", desc: "Balanced approach for overall fitness" },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                      <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-300">
                      <strong className="text-white">{item.label}</strong> — {item.desc}
                    </span>
                  </li>
                ))}
              </ul>
            </AnimatedSection>
            <AnimatedSection direction="right" className="flex-1 flex justify-center">
              <PhoneMockup />
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── PERSONALIZED ONBOARDING ─────────────────────── */}
      <section className="w-full bg-zinc-950 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-12 lg:flex-row-reverse lg:items-center lg:gap-16">
            <AnimatedSection direction="right" className="flex-1">
              <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Built Around You</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                Your Training Starts<br />With Your Goals
              </h2>
              <p className="mt-4 text-lg text-zinc-400">
                Before you touch a weight, we ask what matters most to you. Fat loss, muscle, strength, endurance — tell us and we match you with the right program, schedule, and weekly structure.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Fat Loss", icon: "🔥" },
                  { label: "Muscle Building", icon: "💪" },
                  { label: "Strength", icon: "⚡" },
                  { label: "General Fitness", icon: "🏃" },
                  { label: "Endurance", icon: "🎯" },
                  { label: "Body Recomposition", icon: "⚖️" },
                ].map((goal) => (
                  <div key={goal.label} className="flex items-center gap-3 rounded-xl bg-zinc-900 p-4 border border-zinc-800">
                    <span className="text-xl">{goal.icon}</span>
                    <span className="font-medium text-zinc-200">{goal.label}</span>
                  </div>
                ))}
              </div>
            </AnimatedSection>

            <AnimatedSection direction="left" className="flex-1 flex justify-center">
              {/* Onboarding card mockup */}
              <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-zinc-800 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Step 2 of 4</span>
                    <span className="text-xs text-zinc-600">50%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800">
                    <div className="h-1.5 w-1/2 rounded-full bg-white" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white">What&apos;s your primary goal?</h3>
                <div className="space-y-2">
                  {["Lose Fat", "Build Muscle", "Get Stronger"].map((g, i) => (
                    <div
                      key={g}
                      className={`flex items-center gap-3 rounded-xl p-3 border transition-all ${
                        i === 0
                          ? "border-white bg-white/10 text-white"
                          : "border-zinc-700 text-zinc-400"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        i === 0 ? "border-white bg-white" : "border-zinc-600"
                      }`}>
                        {i === 0 && <div className="h-2 w-2 rounded-full bg-black" />}
                      </div>
                      <span className="text-sm font-medium">{g}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 space-y-2">
                  <div className="text-xs text-zinc-500">How many days per week?</div>
                  <div className="flex gap-2">
                    {[3, 4, 5, 6].map((d) => (
                      <div
                        key={d}
                        className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold border transition-all ${
                          d === 4 ? "border-white bg-white text-black" : "border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {d}x
                      </div>
                    ))}
                  </div>
                </div>
                <button className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black">
                  Continue
                </button>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── SMART EXERCISE ALTERNATIVES ─────────────────── */}
      <section className="w-full bg-black py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
            <AnimatedSection direction="left" className="flex-1">
              <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Flexibility</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                No Equipment?<br />No Problem.
              </h2>
              <p className="mt-4 text-lg text-zinc-400">
                Don&apos;t have access to a specific piece of equipment — or just hate a certain exercise? Swap it instantly. The algorithm finds the best alternative that hits the same muscles with what you have available.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  "Scores alternatives by muscle overlap, movement pattern, and difficulty",
                  "Permanent swaps saved to your program — never repeated",
                  "Works across all programs and phases automatically",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                      <div className="h-2 w-2 rounded-full bg-blue-400" />
                    </div>
                    <span className="text-zinc-400">{point}</span>
                  </li>
                ))}
              </ul>
            </AnimatedSection>

            <AnimatedSection direction="right" className="flex-1 flex justify-center">
              {/* Exercise swap mockup */}
              <div className="w-full max-w-sm space-y-3">
                {/* Original exercise */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Current Exercise</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">Barbell Bench Press</div>
                      <div className="text-sm text-zinc-400 mt-0.5">Chest · Compound · Barbell</div>
                    </div>
                    <div className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">Swap</div>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="mx-3 text-xs text-zinc-600">Best alternatives</span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                {[
                  { name: "Dumbbell Bench Press", score: 97, tag: "Best Match" },
                  { name: "Incline Cable Fly", score: 88, tag: "High Overlap" },
                  { name: "Push-Up Variation", score: 76, tag: "No Equipment" },
                ].map((alt, i) => (
                  <div
                    key={alt.name}
                    className={`rounded-2xl border p-4 transition-all ${
                      i === 0 ? "border-blue-500/40 bg-blue-500/5" : "border-zinc-800 bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white text-sm">{alt.name}</div>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          i === 0 ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-500"
                        }`}>
                          {alt.tag}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${i === 0 ? "text-blue-400" : "text-zinc-400"}`}>
                          {alt.score}%
                        </div>
                        <div className="text-xs text-zinc-600">match</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── PROGRESS TRACKING ───────────────────────────── */}
      <section className="w-full bg-zinc-950 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-12 lg:flex-row-reverse lg:items-center lg:gap-16">
            <AnimatedSection direction="right" className="flex-1">
              <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Progress</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                Watch Your<br />Transformation
              </h2>
              <p className="mt-4 text-lg text-zinc-400">
                Track lifts, body weight, mood, and workout history all in one place. Every number tells part of your story.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  {
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
                    title: "Lift PRs & Volume",
                    desc: "Track sets, reps, and weight — see all-time bests per exercise",
                  },
                  {
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />,
                    title: "Body Measurements",
                    desc: "Weight trends charted over time with smart daily prompts",
                  },
                  {
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
                    title: "Mood & Energy",
                    desc: "Daily check-ins to correlate how you feel with how you train",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4 rounded-2xl bg-zinc-900 p-4 border border-zinc-800">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white">
                      <svg className="h-5 w-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {item.icon}
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{item.title}</h4>
                      <p className="mt-0.5 text-sm text-zinc-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AnimatedSection>
            <AnimatedSection direction="left" className="flex-1">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { stat: "+45", label: "lbs on squat", color: "from-green-900/40 to-green-950" },
                  { stat: "-12", label: "lbs body weight", color: "from-blue-900/40 to-blue-950" },
                  { stat: "+2\"", label: "arm measurement", color: "from-purple-900/40 to-purple-950" },
                  { stat: "-4\"", label: "waist measurement", color: "from-orange-900/40 to-orange-950" },
                ].map((item) => (
                  <div key={item.label} className={`rounded-2xl bg-gradient-to-br ${item.color} p-6 border border-zinc-800`}>
                    <div className="text-4xl font-black text-white">{item.stat}</div>
                    <div className="mt-1 text-sm text-zinc-400">{item.label}</div>
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── COACHING ────────────────────────────────────── */}
      <section className="w-full bg-black py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection className="text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Coaching</span>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Direct Access When You Need It</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
              Questions come up. Form checks are needed. Life happens. Get direct chat access to guidance that actually understands your situation.
            </p>
          </AnimatedSection>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />,
                title: "Quick Questions",
                desc: "Fast answers on form, exercise swaps, or program adjustments.",
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />,
                title: "Form Reviews",
                desc: "Submit videos for technique feedback and corrections.",
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
                title: "Accountability",
                desc: "Check-ins and support to keep you consistently on track.",
              },
            ].map((item) => (
              <AnimatedSection key={item.title} direction="up">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800">
                    <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {item.icon}
                    </svg>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────── */}
      <section className="w-full bg-zinc-950 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Real People. Real Results.</h2>
            <p className="mt-3 text-lg text-zinc-400">Join hundreds who have transformed with {appName}</p>
          </AnimatedSection>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                quote: "Finally a program that makes sense. No BS, just results. Down 20lbs and stronger than ever.",
                name: "Mike T.",
                tag: "12-week transformation",
              },
              {
                quote: "The nutrition guidance changed everything. Simple targets I could actually follow. Game changer.",
                name: "Sarah K.",
                tag: "8-week transformation",
              },
              {
                quote: "Having direct access for questions was huge. No more second-guessing. Just execute and grow.",
                name: "James R.",
                tag: "16-week transformation",
              },
            ].map((t) => (
              <AnimatedSection key={t.name} direction="up">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="mt-4 text-zinc-300">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-zinc-700" />
                    <div>
                      <div className="text-sm font-semibold text-white">{t.name}</div>
                      <div className="text-xs text-zinc-500">{t.tag}</div>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────── */}
      <section className="w-full bg-black py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-6">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Frequently Asked Questions</h2>
          </AnimatedSection>
          <div className="mt-10 space-y-3">
            {[
              { q: "Do I need a gym to follow the programs?", a: "Most programs are designed for a commercial gym. Home gym variations and equipment-free alternatives are available via the exercise swap feature." },
              { q: "How often are new programs added?", a: "New programs are added regularly. All members get access as soon as they drop." },
              { q: "Can I change programs mid-way?", a: "Yes. Switch anytime — your workout history stays intact regardless of what program you're on." },
              { q: "How does the nutrition guidance work?", a: "You'll get personalized macro targets based on your stats and goals. Track with any app and aim to hit your numbers daily." },
              { q: "How fast will I see results?", a: "Most people notice strength improvements within 2–3 weeks and visible changes within 6–8 weeks with consistent effort." },
              { q: "What is a streak freeze?", a: "A streak freeze protects your streak on days you can't train. Earn them through consistent activity — they're your safety net, not an excuse." },
            ].map((faq, i) => (
              <AnimatedSection key={i} delay={i * 0.05}>
                <details className="group rounded-xl border border-zinc-800 bg-zinc-900">
                  <summary className="flex cursor-pointer items-center justify-between p-4 font-semibold text-white">
                    {faq.q}
                    <svg className="h-5 w-5 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 group-open:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="border-t border-zinc-800 px-5 pb-5 pt-4 text-zinc-400">{faq.a}</p>
                </details>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────── */}
      <section className="w-full bg-zinc-950 py-20 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <AnimatedSection>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              Ready to Transform?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-400">
              Stop guessing. Start getting results. Join now and get instant access to proven programs, nutrition guidance, and direct coaching.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="rounded-full bg-white px-10 py-4 text-center font-semibold text-black transition-all hover:bg-zinc-200 hover:scale-105"
              >
                Get Started Now
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-zinc-700 px-10 py-4 text-center font-medium text-zinc-300 transition-all hover:border-zinc-400 hover:text-white"
              >
                Already a member? Sign In
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="w-full border-t border-zinc-800 bg-black py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <Image src={logo} alt={appName} width={28} height={28} className="rounded-full object-cover" />
            <span className="font-semibold">{appName}</span>
          </div>
          <p className="text-center text-sm text-zinc-600">
            &copy; {new Date().getFullYear()} {appName}. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
