"use client";

import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageTransition from "@/components/PageTransition";
import AnimatedSection from "@/components/AnimatedSection";
import PhoneMockup from "@/components/PhoneMockup";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Become";

export default function Information() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <PageTransition className="flex min-h-screen w-full flex-col items-center">
        {/* Header */}
        <div className="w-full max-w-6xl px-6 pt-8">
          <Header />
        </div>

        {/* Hero Section */}
        <section className="w-full bg-zinc-50 py-16 sm:py-24 dark:bg-black">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 lg:flex-row lg:gap-12">
            <AnimatedSection direction="left" className="flex-1 text-center lg:text-left">
              <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-white">
                Train like you <span className="text-zinc-600 dark:text-zinc-400">mean it.</span>
              </h1>
              <p className="mt-6 text-lg text-zinc-600 sm:text-xl dark:text-zinc-400">
                Jon transformed himself to the extreme. This app gives you the programming, nutrition, chat access, and progress tracking you need to stop guessing and start getting results.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
                <Link 
                  href="/register" 
                  className="rounded-full bg-zinc-900 px-8 py-4 text-center font-semibold text-white transition-all hover:bg-zinc-800 hover:scale-105 dark:bg-white dark:text-black"
                >
                  Get Started Free
                </Link>
                <Link 
                  href="/login" 
                  className="rounded-full border-2 border-zinc-300 px-8 py-4 text-center font-semibold text-zinc-900 transition-all hover:border-zinc-900 dark:border-zinc-700 dark:text-white dark:hover:border-white"
                >
                  Sign In
                </Link>
              </div>
            </AnimatedSection>
            <AnimatedSection direction="right" className="w-full max-w-md lg:w-1/2">
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl shadow-2xl">
                <iframe 
                  src="https://www.youtube.com/embed/ZgDz9YMYVFo?autoplay=1&mute=1&loop=1&playlist=ZgDz9YMYVFo" 
                  title="Transformation Journey" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  referrerPolicy="strict-origin-when-cross-origin" 
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* Features Overview */}
        <section className="w-full bg-white py-16 dark:bg-zinc-900">
          <div className="mx-auto max-w-6xl px-6">
            <AnimatedSection className="text-center">
              <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">Everything You Need to Transform</h2>
              <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">One platform. Complete results.</p>
            </AnimatedSection>
            <div className="mt-12 space-y-3 sm:space-y-0 sm:grid sm:gap-6 sm:grid-cols-2 lg:grid-cols-5">
              <AnimatedSection direction="left" delay={0}>
                <div className="group flex items-center gap-4 rounded-xl bg-zinc-50 p-4 transition-all hover:bg-zinc-100 sm:flex-col sm:items-start sm:gap-0 sm:aspect-square sm:p-6 hover:shadow-lg dark:bg-zinc-800 dark:hover:bg-zinc-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 sm:h-14 sm:w-14 dark:bg-white">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-initial">
                    <h3 className="text-base font-bold text-zinc-900 sm:mt-4 sm:text-xl dark:text-white">Programming</h3>
                    <p className="mt-0.5 text-sm text-zinc-600 sm:mt-2 dark:text-zinc-400">Structured plans for strength, hypertrophy, and conditioning built by experience.</p>
                  </div>
                </div>
              </AnimatedSection>
              <AnimatedSection direction="right" delay={0.1}>
                <div className="group flex items-center gap-4 rounded-xl bg-zinc-50 p-4 transition-all hover:bg-zinc-100 sm:flex-col sm:items-start sm:gap-0 sm:aspect-square sm:p-6 hover:shadow-lg dark:bg-zinc-800 dark:hover:bg-zinc-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 sm:h-14 sm:w-14 dark:bg-white">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-initial">
                    <h3 className="text-base font-bold text-zinc-900 sm:mt-4 sm:text-xl dark:text-white">Nutrition</h3>
                    <p className="mt-0.5 text-sm text-zinc-600 sm:mt-2 dark:text-zinc-400">Simple, sustainable targets to fuel your training and optimize recovery.</p>
                  </div>
                </div>
              </AnimatedSection>
              <AnimatedSection direction="left" delay={0.2}>
                <div className="group flex items-center gap-4 rounded-xl bg-zinc-50 p-4 transition-all hover:bg-zinc-100 sm:flex-col sm:items-start sm:gap-0 sm:aspect-square sm:p-6 hover:shadow-lg dark:bg-zinc-800 dark:hover:bg-zinc-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 sm:h-14 sm:w-14 dark:bg-white">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-initial">
                    <h3 className="text-base font-bold text-zinc-900 sm:mt-4 sm:text-xl dark:text-white">Mindset</h3>
                    <p className="mt-0.5 text-sm text-zinc-600 sm:mt-2 dark:text-zinc-400">Mental frameworks and discipline strategies to stay consistent long-term.</p>
                  </div>
                </div>
              </AnimatedSection>
              <AnimatedSection direction="right" delay={0.3}>
                <div className="group flex items-center gap-4 rounded-xl bg-zinc-50 p-4 transition-all hover:bg-zinc-100 sm:flex-col sm:items-start sm:gap-0 sm:aspect-square sm:p-6 hover:shadow-lg dark:bg-zinc-800 dark:hover:bg-zinc-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 sm:h-14 sm:w-14 dark:bg-white">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-initial">
                    <h3 className="text-base font-bold text-zinc-900 sm:mt-4 sm:text-xl dark:text-white">Coaching Chat</h3>
                    <p className="mt-0.5 text-sm text-zinc-600 sm:mt-2 dark:text-zinc-400">Direct access to guidance when you need it. No guessing, just answers.</p>
                  </div>
                </div>
              </AnimatedSection>
              <AnimatedSection direction="left" delay={0.4}>
                <div className="group flex items-center gap-4 rounded-xl bg-zinc-50 p-4 transition-all hover:bg-zinc-100 sm:flex-col sm:items-start sm:gap-0 sm:aspect-square sm:p-6 hover:shadow-lg dark:bg-zinc-800 dark:hover:bg-zinc-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 sm:h-14 sm:w-14 dark:bg-white">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-initial">
                    <h3 className="text-base font-bold text-zinc-900 sm:mt-4 sm:text-xl dark:text-white">Progress Tracking</h3>
                    <p className="mt-0.5 text-sm text-zinc-600 sm:mt-2 dark:text-zinc-400">Track lifts, measurements, and photos. Watch your transformation unfold.</p>
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* Programming Deep Dive */}
        <section className="w-full bg-zinc-50 py-16 sm:py-24 dark:bg-black">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center">
              <AnimatedSection direction="left" className="flex-1">
                <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Programming</span>
                <h2 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">
                  Proven Programs That Deliver Results
                </h2>
                <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                  No cookie-cutter templates. Each program is designed from real-world experience and constant refinement. Choose your path and follow a structured plan built to get you stronger, leaner, and more conditioned.
                </p>
                <ul className="mt-8 space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Strength Programs</strong> — Build raw power with progressive overload</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Hypertrophy Programs</strong> — Maximize muscle growth with volume training</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Conditioning Programs</strong> — Improve endurance and work capacity</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Hybrid Programs</strong> — Balanced approach for overall fitness</span>
                  </li>
                </ul>
              </AnimatedSection>
              <AnimatedSection direction="right" className="flex-1 flex justify-center">
                <PhoneMockup />
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* Nutrition Section */}
        <section className="w-full bg-white py-16 sm:py-24 dark:bg-zinc-900">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col gap-12 lg:flex-row-reverse lg:items-center">
              <AnimatedSection direction="right" className="flex-1">
                <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Nutrition</span>
                <h2 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">
                  Simple Nutrition. Real Results.
                </h2>
                <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                  Forget complicated meal plans and restrictive diets. Get clear, sustainable targets based on your goals. Protein, calories, and timing — that&apos;s all you need to know.
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-zinc-50 p-5 dark:bg-zinc-800">
                    <div className="text-3xl font-bold text-zinc-900 dark:text-white">Protein</div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Personalized targets based on your body weight and goals</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-5 dark:bg-zinc-800">
                    <div className="text-3xl font-bold text-zinc-900 dark:text-white">Calories</div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Calculated for fat loss, maintenance, or muscle building</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-5 dark:bg-zinc-800">
                    <div className="text-3xl font-bold text-zinc-900 dark:text-white">Timing</div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Optimize nutrient timing around your training</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-5 dark:bg-zinc-800">
                    <div className="text-3xl font-bold text-zinc-900 dark:text-white">Flexibility</div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Eat foods you enjoy while hitting your targets</p>
                  </div>
                </div>
              </AnimatedSection>
              <AnimatedSection direction="left" className="flex-1">
                <div className="rounded-2xl bg-zinc-900 p-8 text-white dark:bg-black">
                  <h3 className="text-xl font-bold">Your Daily Targets</h3>
                  <p className="mt-2 text-zinc-400">Example for a 180lb individual on a cut</p>
                  <div className="mt-6 space-y-6">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Protein</span>
                        <span className="font-semibold">180g</span>
                      </div>
                      <div className="mt-2 h-3 rounded-full bg-zinc-800">
                        <div className="h-3 w-3/4 rounded-full bg-green-500" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Calories</span>
                        <span className="font-semibold">2,200</span>
                      </div>
                      <div className="mt-2 h-3 rounded-full bg-zinc-800">
                        <div className="h-3 w-2/3 rounded-full bg-blue-500" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Carbs</span>
                        <span className="font-semibold">220g</span>
                      </div>
                      <div className="mt-2 h-3 rounded-full bg-zinc-800">
                        <div className="h-3 w-1/2 rounded-full bg-yellow-500" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Fats</span>
                        <span className="font-semibold">65g</span>
                      </div>
                      <div className="mt-2 h-3 rounded-full bg-zinc-800">
                        <div className="h-3 w-1/3 rounded-full bg-orange-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* Mindset Section */}
        <section className="w-full bg-zinc-50 py-16 sm:py-24 dark:bg-black">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center">
              <AnimatedSection direction="left" className="flex-1">
                <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Mindset</span>
                <h2 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">
                  Your Mind Is Your Greatest Asset
                </h2>
                <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                  Training and nutrition are only half the battle. Without the right mental framework, consistency crumbles. Learn the discipline strategies and mental models that separate those who transform from those who quit.
                </p>
                <ul className="mt-8 space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                      <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Discipline Over Motivation</strong> — Build systems that don&apos;t rely on feeling good</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                      <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Identity Shifting</strong> — Become the person who shows up, not someone who tries to</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                      <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Overcoming Plateaus</strong> — Mental strategies for when progress stalls</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                      <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300"><strong>Long-term Vision</strong> — Play the infinite game, not the 12-week sprint</span>
                  </li>
                </ul>
              </AnimatedSection>
              <AnimatedSection direction="right" className="flex-1">
                <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-800">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-2xl dark:bg-purple-900">
                        🧠
                      </div>
                      <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white">Daily Mindset Prompts</h4>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Start each day with focused intention</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-2xl dark:bg-purple-900">
                        📖
                      </div>
                      <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white">Mental Frameworks Library</h4>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Proven strategies from psychology and experience</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-2xl dark:bg-purple-900">
                        🎯
                      </div>
                      <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white">Goal Setting Templates</h4>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Structure your ambitions into actionable steps</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-2xl dark:bg-purple-900">
                        💪
                      </div>
                      <div>
                        <h4 className="font-semibold text-zinc-900 dark:text-white">Resilience Training</h4>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Build mental toughness that transfers to life</p>
                      </div>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* Coaching Section */}
        <AnimatedSection className="w-full bg-zinc-900 py-16 sm:py-24 dark:bg-zinc-950">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Coaching</span>
              <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
                Direct Access When You Need It
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
                Questions come up. Form checks are needed. Life happens. Get direct chat access to guidance that actually understands your situation.
              </p>
            </div>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-zinc-800 p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700">
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Quick Questions</h3>
                <p className="mt-2 text-zinc-400">Get fast answers on form, exercise swaps, or program adjustments.</p>
              </div>
              <div className="rounded-2xl bg-zinc-800 p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700">
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Form Reviews</h3>
                <p className="mt-2 text-zinc-400">Submit videos for technique feedback and corrections.</p>
              </div>
              <div className="rounded-2xl bg-zinc-800 p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700">
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Accountability</h3>
                <p className="mt-2 text-zinc-400">Check-ins and support to keep you on track.</p>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* Progress Tracking */}
        <section className="w-full bg-white py-16 sm:py-24 dark:bg-zinc-900">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center">
              <AnimatedSection direction="left" className="flex-1">
                <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Progress</span>
                <h2 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">
                  Watch Your Transformation
                </h2>
                <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                  Track everything that matters. Log your lifts, record measurements, and capture progress photos. See how far you&apos;ve come and stay motivated for what&apos;s ahead.
                </p>
                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white">
                      <svg className="h-6 w-6 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-white">Lift Tracking</h4>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">Log sets, reps, and weight for every exercise</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white">
                      <svg className="h-6 w-6 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-white">Body Measurements</h4>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">Weight, body fat, arms, chest, waist, and more</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white">
                      <svg className="h-6 w-6 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-white">Progress Photos</h4>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">Visual timeline of your transformation journey</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
              <AnimatedSection direction="right" className="flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-linear-to-br from-zinc-100 to-zinc-200 p-6 dark:from-zinc-800 dark:to-zinc-700">
                    <div className="text-4xl font-bold text-zinc-900 dark:text-white">+45</div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">lbs on squat</div>
                  </div>
                  <div className="rounded-2xl bg-linear-to-br from-zinc-100 to-zinc-200 p-6 dark:from-zinc-800 dark:to-zinc-700">
                    <div className="text-4xl font-bold text-zinc-900 dark:text-white">-12</div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">lbs body weight</div>
                  </div>
                  <div className="rounded-2xl bg-linear-to-br from-zinc-100 to-zinc-200 p-6 dark:from-zinc-800 dark:to-zinc-700">
                    <div className="text-4xl font-bold text-zinc-900 dark:text-white">+2&quot;</div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">arm measurement</div>
                  </div>
                  <div className="rounded-2xl bg-linear-to-br from-zinc-100 to-zinc-200 p-6 dark:from-zinc-800 dark:to-zinc-700">
                    <div className="text-4xl font-bold text-zinc-900 dark:text-white">-4&quot;</div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">waist measurement</div>
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* Testimonials / Social Proof */}
        <AnimatedSection className="w-full bg-zinc-50 py-16 sm:py-24 dark:bg-black">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">Real People. Real Results.</h2>
              <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">Join hundreds who&apos;ve transformed with {appName}</p>
            </div>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-800">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mt-4 text-zinc-600 dark:text-zinc-300">&quot;Finally a program that makes sense. No BS, just results. Down 20lbs and stronger than ever.&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-white">Mike T.</div>
                    <div className="text-sm text-zinc-500">12-week transformation</div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-800">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mt-4 text-zinc-600 dark:text-zinc-300">&quot;The nutrition guidance changed everything. Simple targets I could actually follow. Game changer.&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-white">Sarah K.</div>
                    <div className="text-sm text-zinc-500">8-week transformation</div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-800">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mt-4 text-zinc-600 dark:text-zinc-300">&quot;Having direct access for questions was huge. No more second-guessing. Just execute and grow.&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-white">James R.</div>
                    <div className="text-sm text-zinc-500">16-week transformation</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* FAQ Section */}
        <AnimatedSection className="w-full bg-white py-16 sm:py-24 dark:bg-zinc-900">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">Frequently Asked Questions</h2>
            </div>
            <div className="mt-12 space-y-4">
              {[
                { q: "Do I need a gym to follow the programs?", a: "Most programs are designed for a commercial gym with standard equipment. Home gym variations are available for some programs." },
                { q: "How often are new programs added?", a: "New programs are added regularly based on community feedback and training phases. All members get access to new programs as they're released." },
                { q: "Can I change programs mid-way?", a: "Yes, you can switch programs at any time. However, we recommend completing at least 4 weeks of a program before switching for best results." },
                { q: "How does the nutrition guidance work?", a: "You'll receive personalized macro targets based on your current stats and goals. Track your food using any app and aim to hit your targets daily." },
                { q: "How fast will I see results?", a: "Most people notice improvements in strength within 2-3 weeks and visible body composition changes within 6-8 weeks with consistent effort." },
              ].map((faq, i) => (
                <details key={i} className="group rounded-xl bg-zinc-50 dark:bg-zinc-800">
                  <summary className="flex cursor-pointer items-center justify-between p-6 font-semibold text-zinc-900 dark:text-white">
                    {faq.q}
                    <svg className="h-5 w-5 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="px-6 pb-6 text-zinc-600 dark:text-zinc-400">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* Final CTA */}
        <AnimatedSection className="w-full bg-zinc-900 py-16 sm:py-24 dark:bg-black">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              Ready to Transform?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
              Stop guessing. Start getting results. Join now and get instant access to proven programs, nutrition guidance, and direct coaching support.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link 
                href="/register" 
                className="rounded-full bg-white px-8 py-4 font-semibold text-black transition-all hover:bg-zinc-200 hover:scale-105"
              >
                Get Started Now
              </Link>
              <Link 
                href="/login" 
                className="rounded-full border-2 border-zinc-700 px-8 py-4 font-semibold text-white transition-all hover:border-white"
              >
                Already a member? Sign In
              </Link>
            </div>
          </div>
        </AnimatedSection>

        {/* Footer */}
        <div className="w-full bg-zinc-50 py-8 dark:bg-black">
          <div className="mx-auto max-w-6xl px-6">
            <Footer />
          </div>
        </div>
      </PageTransition>
    </div>
  );
}
