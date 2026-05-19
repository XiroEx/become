"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "BECOME";
const logo = process.env.NEXT_PUBLIC_LOGO || "/logo.png";
const profileImage = process.env.NEXT_PUBLIC_PROFILE_IMAGE || "/profile.png";

const PHRASES = ["Stronger", "Unstoppable", "Disciplined", "Your Best", "Relentless"];

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
            <Link
              href={isLoggedIn ? "/dashboard" : "/login"}
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              {isLoggedIn ? "Dashboard" : "Sign In"}
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-7"
        >
          <Image
            src={logo}
            alt={appName}
            width={80}
            height={80}
            className="rounded-full object-cover mx-auto"
            priority
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl font-black tracking-tight sm:text-7xl"
        >
          Train to {appName}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-3 h-9 overflow-hidden"
        >
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

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 max-w-sm text-base text-zinc-500 leading-relaxed"
        >
          Structured programs, real progress tracking, and direct coaching — all in one place.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Link
            href="/register"
            className="rounded-full bg-white px-8 py-3.5 text-center font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            Start Your Transformation
          </Link>
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-white"
          >
            {isLoggedIn ? "Go to Dashboard →" : "Already a member? Sign In →"}
          </Link>
        </motion.div>
      </section>

      {/* FEATURE SHOWCASE */}
      <section className="w-full py-20 overflow-hidden">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 text-center mb-10">
            Inside the app
          </p>
          {/* Snap carousel on mobile → 2×2 grid on sm+ */}
          <div className="flex sm:grid sm:grid-cols-2 gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none pb-4 sm:pb-0 -mx-6 px-6 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            {/* TILE 1: Live Workout Tracker */}
            <div className="snap-center shrink-0 w-[82vw] sm:w-auto rounded-2xl bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-green-500" />
              <div className="p-5">
                <p className="text-xs text-zinc-500 mb-1">Live Workout</p>
                <p className="font-bold text-white mb-4">Bench Press — Set 3 of 4</p>
                <div className="space-y-2">
                  {[
                    { done: true, label: "Set 1", weight: "185", reps: "8" },
                    { done: true, label: "Set 2", weight: "185", reps: "8" },
                    { done: false, label: "Set 3", weight: "185", reps: "8", active: true },
                    { done: false, label: "Set 4", weight: "185", reps: "8" },
                  ].map((set, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${set.active ? "bg-green-500/10" : "bg-zinc-800/60"}`}
                    >
                      <div className={`h-5 w-5 rounded-full shrink-0 flex items-center justify-center ${set.done ? "bg-green-500" : set.active ? "border-2 border-green-500" : "border border-zinc-700"}`}>
                        {set.done && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-zinc-400">{set.label}</span>
                      <span className="ml-auto text-sm font-semibold text-white">{set.weight} lbs · {set.reps} reps</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-zinc-600">Exercise 3 of 6 · Chest Day</p>
              </div>
            </div>

            {/* TILE 2: Streak System */}
            <div className="snap-center shrink-0 w-[82vw] sm:w-auto rounded-2xl bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-orange-500" />
              <div className="p-5">
                <p className="text-xs text-zinc-500 mb-1">Current Streak</p>
                <div className="flex items-end gap-2 mb-4">
                  <span className="text-6xl font-black text-white leading-none">23</span>
                  <span className="text-zinc-500 pb-1">days in a row</span>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-5">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div
                      key={i}
                      className={`aspect-square rounded-sm transition-colors ${
                        i < 23
                          ? i < 7 ? "bg-orange-400" : i < 14 ? "bg-orange-500" : "bg-orange-600"
                          : "bg-zinc-800"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between">
                  {[7, 14, 30, 60, 100].map((m) => (
                    <div key={m} className="flex flex-col items-center gap-1">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold ${23 >= m ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "bg-zinc-800 text-zinc-600"}`}>
                        {m}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-zinc-700 text-center">Earn freezes · Hit milestones · Stay consistent</p>
              </div>
            </div>

            {/* TILE 3: Progress */}
            <div className="snap-center shrink-0 w-[82vw] sm:w-auto rounded-2xl bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-blue-500" />
              <div className="p-5">
                <p className="text-xs text-zinc-500 mb-4">Your Progress</p>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { stat: "-12", label: "lbs body weight", color: "text-blue-400" },
                    { stat: "+45", label: "lbs on squat", color: "text-green-400" },
                    { stat: "+2\"", label: "arms", color: "text-purple-400" },
                    { stat: "-4\"", label: "waist", color: "text-orange-400" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-zinc-800/80 p-3">
                      <div className={`text-2xl font-black ${item.color}`}>{item.stat}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>
                {/* Mini bar chart */}
                <div className="flex items-end gap-1 h-14">
                  {[38, 52, 44, 61, 50, 67, 62, 74, 70, 82, 80, 100].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${h}%`,
                        background: i === 11 ? "#3b82f6" : `rgba(59,130,246,${0.15 + (i / 11) * 0.45})`,
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-xs text-zinc-700">8 weeks ago</span>
                  <span className="text-xs text-zinc-700">Today</span>
                </div>
              </div>
            </div>

            {/* TILE 4: Coaching Chat */}
            <div className="snap-center shrink-0 w-[82vw] sm:w-auto rounded-2xl bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-purple-500" />
              <div className="p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                    <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Jon Don</p>
                    <p className="text-xs text-green-400">Online</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-zinc-700 px-3.5 py-2.5">
                      <p className="text-sm text-white">Should I bump the weight? Hit all 4 sets clean.</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full">
                      <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-800 px-3.5 py-2.5">
                      <p className="text-sm text-zinc-200">Yes — go up 5 lbs. Bar path looked solid. Tighten your retraction before unracking.</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-zinc-700 px-3.5 py-2.5">
                      <p className="text-sm text-white">Let&apos;s get it 💪</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
          {/* Mobile swipe hint */}
          <p className="text-center text-xs text-zinc-700 mt-4 sm:hidden">swipe to explore →</p>
        </div>
      </section>

      {/* COACH QUOTE */}
      <section className="w-full bg-zinc-950 py-20 px-6">
        <div className="mx-auto max-w-3xl flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-10">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full">
            <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
          </div>
          <div>
            <p className="text-lg font-medium text-white leading-relaxed">
              &ldquo;I transformed myself from the ground up and built this app to give you the exact programming and accountability I used. No templates. No guessing. Just what actually works.&rdquo;
            </p>
            <p className="mt-3 text-sm text-zinc-600">Jon Don · Founder &amp; Coach</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-24 px-6 text-center">
        <div className="mx-auto max-w-lg">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            Ready to start?
          </h2>
          <p className="mt-4 text-base text-zinc-500 leading-relaxed">
            Stop guessing. Get a structured program, track what actually matters, and have someone in your corner.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-full bg-white px-10 py-4 font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full border-t border-zinc-900 bg-black py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src={logo} alt={appName} width={22} height={22} className="rounded-full object-cover" />
            <span className="text-sm font-semibold">{appName}</span>
          </div>
          <p className="text-xs text-zinc-700">
            &copy; {new Date().getFullYear()} {appName}. All rights reserved.
          </p>
          <div className="flex gap-5 text-xs text-zinc-600">
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
