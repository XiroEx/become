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
          <Image src={logo} alt={appName} width={80} height={80} className="rounded-full object-cover mx-auto" priority />
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
          Structured programs, nutrition guidance, mindset tracking, and real coaching — the only platform built to take you from where you are to who you want to be.
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
            Start Free
          </Link>
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-white"
          >
            {isLoggedIn ? "Go to Dashboard →" : "Already a member? Sign In →"}
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 flex flex-wrap justify-center gap-2"
        >
          {["Programming", "Nutrition", "Mindset", "Coaching", "Progress Tracking"].map((pill) => (
            <span key={pill} className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-600">
              {pill}
            </span>
          ))}
        </motion.div>
      </section>

      {/* PROGRAMS */}
      <section className="w-full bg-zinc-950 py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-green-500">Programming</span>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl leading-tight">
                Real programs.<br />Built by a real coach.
              </h2>
              <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                Every program in Become was designed from Jon&apos;s real-world coaching experience — not templates, not AI-generated plans. Multi-phase structures with progressive overload baked in, so you always know exactly what to lift, when to push, and when to back off.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Strength, hypertrophy, conditioning, and hybrid programs",
                  "Multi-phase progression — each block builds on the last",
                  "Live set-by-set workout tracking with weight & rep logging",
                  "Smart exercise swaps when you lack equipment or hate a move",
                  "Auto-scheduling synced to your available training days",
                  "All-time PRs tracked per exercise across every program",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-zinc-400">
                    <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full bg-green-500/20 flex items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Workout mockup */}
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-sm rounded-2xl bg-zinc-900 overflow-hidden shadow-2xl">
                <div className="h-1 bg-green-500" />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-zinc-500">Chest Day · Exercise 3 of 6</p>
                    <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">In Progress</span>
                  </div>
                  <p className="font-bold text-white text-lg mb-4">Bench Press</p>
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
                  <div className="mt-4 flex gap-2">
                    <div className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-center">
                      <p className="text-xs text-zinc-600">Last session</p>
                      <p className="text-sm font-semibold text-zinc-300 mt-0.5">185 × 8</p>
                    </div>
                    <div className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-center">
                      <p className="text-xs text-zinc-600">All-time PR</p>
                      <p className="text-sm font-semibold text-green-400 mt-0.5">195 × 6</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NUTRITION */}
      <section className="w-full bg-black py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-12 lg:flex-row-reverse lg:items-center lg:gap-16">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-orange-500">Nutrition</span>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl leading-tight">
                Fuel the work.<br />See the results.
              </h2>
              <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                Nutrition doesn&apos;t have to be complicated. Get personalized macro targets based on your stats and goals, search and log what you eat, and focus on hitting your numbers. Simple enough to actually stick with — effective enough to actually work.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Personalized protein, carb, and fat targets",
                  "Fast food search across 500,000+ items",
                  "Daily logging with running macro totals",
                  "Calorie tracking that adjusts as your goals evolve",
                  "Tied directly to your training — fuel matches your program",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-zinc-400">
                    <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Nutrition mockup */}
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-sm rounded-2xl bg-zinc-900 overflow-hidden shadow-2xl">
                <div className="h-1 bg-orange-500" />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-zinc-500">Today&apos;s Nutrition</p>
                    <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full">On Track</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: "Protein", current: 148, target: 180, color: "bg-blue-500", textColor: "text-blue-400" },
                      { label: "Carbs", current: 210, target: 250, color: "bg-orange-500", textColor: "text-orange-400" },
                      { label: "Fats", current: 52, target: 65, color: "bg-yellow-500", textColor: "text-yellow-400" },
                    ].map((macro) => (
                      <div key={macro.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-white">{macro.label}</span>
                          <span className={`text-xs ${macro.textColor}`}>
                            {macro.current}g <span className="text-zinc-600">/ {macro.target}g</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-800">
                          <div
                            className={`h-2 rounded-full ${macro.color}`}
                            style={{ width: `${Math.round((macro.current / macro.target) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Total Calories</span>
                    <span className="text-sm font-bold text-white">
                      1,892 <span className="text-zinc-600 font-normal">/ 2,200</span>
                    </span>
                  </div>
                  <div className="mt-3 rounded-xl bg-zinc-800/40 px-4 py-2.5">
                    <p className="text-xs text-zinc-500">Recently logged</p>
                    <div className="mt-1.5 space-y-1">
                      {["Chicken Breast, 6oz", "Brown Rice, 1 cup", "Almonds, 1oz"].map((food) => (
                        <div key={food} className="flex items-center justify-between">
                          <span className="text-xs text-zinc-400">{food}</span>
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MINDSET */}
      <section className="w-full bg-zinc-950 py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-purple-500">Mindset</span>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl leading-tight">
                The mental edge<br />most apps ignore.
              </h2>
              <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                Consistency is the only thing that separates people who transform and people who don&apos;t. Become tracks the mental side — daily mood check-ins, streak accountability, and milestones that make showing up feel like winning.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Daily mood & energy check-ins (1–5 scale)",
                  "Streak tracking across workouts, weigh-ins, and check-ins",
                  "Streak freezes to protect your streak on rest days",
                  "Milestones at 7, 14, 30, 60, and 100 days",
                  "See how your mood correlates with your training performance",
                  "Email notifications when you hit milestone streaks",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-zinc-400">
                    <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mindset mockup */}
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-sm rounded-2xl bg-zinc-900 overflow-hidden shadow-2xl">
                <div className="h-1 bg-purple-500" />
                <div className="p-5">
                  <p className="text-xs text-zinc-500 mb-3">Daily Check-In</p>
                  <p className="font-semibold text-white mb-4">How are you feeling today?</p>
                  <div className="flex justify-between mb-6">
                    {["😔", "😕", "😐", "🙂", "😄"].map((emoji, i) => (
                      <div key={i} className={`flex flex-col items-center gap-1.5 ${i === 3 ? "" : "opacity-35"}`}>
                        <div className={`text-2xl rounded-xl p-2 ${i === 3 ? "bg-purple-500/20" : ""}`}>{emoji}</div>
                        <span className="text-xs text-zinc-600">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-zinc-800/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-white">Current Streak</span>
                      <span className="text-sm font-black text-orange-400">23 days 🔥</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-3">
                      {Array.from({ length: 21 }).map((_, i) => (
                        <div
                          key={i}
                          className={`aspect-square rounded-sm ${
                            i < 20 ? "bg-orange-500" : "bg-orange-500/30"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between">
                      {[7, 14, 30, 60, 100].map((m) => (
                        <div
                          key={m}
                          className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            23 >= m
                              ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                              : "bg-zinc-700 text-zinc-600"
                          }`}
                        >
                          {m}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COACHING */}
      <section className="w-full bg-black py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-12 lg:flex-row-reverse lg:items-center lg:gap-16">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-500">Coaching</span>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl leading-tight">
                Direct access.<br />Real answers.
              </h2>
              <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                Questions come up. Form breaks down. Life throws curveballs. Get direct chat access to Jon — not a bot, not a generic FAQ. Someone who knows your program, your history, and exactly what you need to hear.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Ask about form, technique, or program adjustments anytime",
                  "Submit workout video clips for direct technique feedback",
                  "Weekly check-ins to keep you honest and on track",
                  "Coaching that knows your data — not starting from scratch every time",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-zinc-400">
                    <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Chat mockup */}
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-sm rounded-2xl bg-zinc-900 overflow-hidden shadow-2xl">
                <div className="h-1 bg-blue-500" />
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                    <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Jon Don</p>
                    <p className="text-xs text-green-400">Online</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-zinc-700 px-3.5 py-2.5">
                      <p className="text-sm text-white">Should I bump the weight? Hit all 4 sets at 185 clean.</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
                      <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
                    </div>
                    <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-zinc-800 px-3.5 py-2.5">
                      <p className="text-sm text-zinc-200">Yes — go to 190. Bar path looked solid. Tighten your retraction before you unrack and you&apos;re good.</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-zinc-700 px-3.5 py-2.5">
                      <p className="text-sm text-white">Let&apos;s get it 💪</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
                      <Image src={profileImage} alt="Jon Don" fill className="object-cover" />
                    </div>
                    <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-zinc-800 px-3.5 py-2.5">
                      <p className="text-sm text-zinc-200">Also — protein&apos;s been low this week. Hit 180g today going into the session. Makes a real difference.</p>
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-4">
                  <div className="rounded-xl bg-zinc-800 px-3.5 py-2.5 flex items-center gap-2">
                    <span className="text-sm text-zinc-600 flex-1">Message Jon...</span>
                    <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY BECOME */}
      <section className="w-full bg-black py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 text-center mb-12">
            Why Become
          </p>
          <div className="grid gap-10 sm:grid-cols-3">
            {[
              {
                heading: "Not an algorithm.\nA real coach.",
                body: "Every program and every answer in coaching chat comes from Jon's real experience — not a formula that treats everyone the same. You get the same approach that actually worked.",
              },
              {
                heading: "Stop juggling\nfour apps.",
                body: "Programs, nutrition tracking, mood logging, and coaching in one place. Stop bouncing between apps and start seeing the full picture of your progress.",
              },
              {
                heading: "Accountability\nis built in.",
                body: "The streak system, daily check-ins, and coaching chat aren't extras — they're the core. Because transformation doesn't happen without showing up consistently.",
              },
            ].map((item) => (
              <div key={item.heading}>
                <div className="h-px w-8 bg-zinc-700 mb-5" />
                <h3 className="text-lg font-bold text-white leading-snug whitespace-pre-line">{item.heading}</h3>
                <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="w-full bg-zinc-950 py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 text-center mb-2">Results</p>
          <h2 className="text-2xl font-black text-white text-center mb-10">Real people. Real results.</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              {
                quote: "Finally a program that makes sense. No BS, just results. Down 20 lbs and stronger than I've ever been in my life.",
                name: "Mike T.",
                tag: "12-week transformation",
                initial: "M",
              },
              {
                quote: "The nutrition guidance changed everything for me. Simple targets I could actually follow every day. Absolute game changer.",
                name: "Sarah K.",
                tag: "8-week transformation",
                initial: "S",
              },
              {
                quote: "Having direct access for questions was huge. No more second-guessing every session. Just execute and grow.",
                name: "James R.",
                tag: "16-week transformation",
                initial: "J",
              },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl bg-zinc-900 p-6">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                    {t.initial}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-zinc-600">{t.tag}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="w-full bg-black py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 text-center mb-2">Pricing</p>
          <h2 className="text-2xl font-black text-white text-center mb-2">
            Start free. Upgrade when you&apos;re ready.
          </h2>
          <p className="text-center text-sm text-zinc-600 mb-12">No credit card required to get started.</p>

          <div className="grid gap-5 sm:grid-cols-3">
            {/* Free */}
            <div className="rounded-2xl bg-zinc-900 p-6 flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Free</p>
              <div className="mb-1">
                <span className="text-4xl font-black text-white">$0</span>
                <span className="text-zinc-600 ml-1 text-sm">/mo</span>
              </div>
              <p className="text-xs text-zinc-600 mb-6">Get started, no strings attached</p>
              <ul className="space-y-3 mb-8 flex-1">
                {[
                  "Starter programs",
                  "Workout logging",
                  "Weight & mood tracking",
                  "Streak system & milestones",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block w-full rounded-xl bg-zinc-800 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
              >
                Get Started Free
              </Link>
            </div>

            {/* Premium */}
            <div className="rounded-2xl bg-white p-6 flex flex-col relative">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">Most Popular</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">Premium</p>
              <div className="mb-1">
                <span className="text-4xl font-black text-black">$29</span>
                <span className="text-zinc-500 ml-1 text-sm">/mo</span>
              </div>
              <p className="text-xs text-zinc-500 mb-6">Everything you need to transform</p>
              <ul className="space-y-3 mb-8 flex-1">
                {[
                  "All programs + every training phase",
                  "Full nutrition guidance & logging",
                  "Direct coaching chat access",
                  "Smart exercise alternatives",
                  "Training calendar & scheduling",
                  "Progress charts & PR tracking",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-700">
                    <svg className="h-3.5 w-3.5 shrink-0 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block w-full rounded-xl bg-black py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
              >
                Upgrade to Premium
              </Link>
            </div>

            {/* Elite — coming soon */}
            <div className="rounded-2xl bg-zinc-900 p-6 flex flex-col relative opacity-60">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-400">Coming Soon</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Elite</p>
              <div className="mb-1">
                <span className="text-4xl font-black text-white">—</span>
              </div>
              <p className="text-xs text-zinc-600 mb-6">Dedicated 1-on-1 coaching</p>
              <ul className="space-y-3 mb-8 flex-1">
                {[
                  "Everything in Premium",
                  "Custom programming built for you",
                  "Dedicated coach — your plan, your pace",
                  "Weekly 1-on-1 check-ins",
                  "Form video reviews",
                  "Personalized nutrition planning",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-700 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled
                className="block w-full rounded-xl bg-zinc-800 py-3 text-center text-sm font-semibold text-zinc-600 cursor-not-allowed"
              >
                Join Waitlist
              </button>
            </div>
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
              &ldquo;I transformed myself from the ground up and built this app to give you the exact programming, nutrition, and accountability I used. No templates. No guessing. Just what actually works.&rdquo;
            </p>
            <p className="mt-3 text-sm text-zinc-600">Jon Don · Founder &amp; Coach</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full bg-black py-24 px-6 text-center">
        <div className="mx-auto max-w-lg">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">Ready to start?</h2>
          <p className="mt-4 text-base text-zinc-500 leading-relaxed">
            Your free account is waiting. Get access to starter programs, tracking, and the streak system today — upgrade when you&apos;re ready for more.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-full bg-white px-10 py-4 font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            Start Free Today
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
