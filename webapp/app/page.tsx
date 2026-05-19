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

      {/* FEATURES */}
      <section className="w-full py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-12 sm:grid-cols-3">
            {[
              {
                accent: "bg-green-500",
                label: "Programming",
                text: "Multi-phase programs built for strength, hypertrophy, and conditioning. Progressive overload built in — no guesswork.",
              },
              {
                accent: "bg-blue-500",
                label: "Progress Tracking",
                text: "Log every lift, weigh-in, and mood check-in. Charts show the arc of your transformation over time.",
              },
              {
                accent: "bg-orange-500",
                label: "Coaching Access",
                text: "Direct chat when you need it. Form checks, program questions, accountability — fast answers from someone who actually knows your data.",
              },
            ].map((f) => (
              <div key={f.label}>
                <div className={`h-0.5 w-8 rounded-full ${f.accent} mb-5`} />
                <h3 className="text-base font-bold text-white">{f.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{f.text}</p>
              </div>
            ))}
          </div>
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
