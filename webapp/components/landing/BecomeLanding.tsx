"use client"

import { useState, useSyncExternalStore } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  Brain,
  Calendar,
  Camera,
  Check,
  ClipboardList,
  Dumbbell,
  Flame,
  LayoutGrid,
  LineChart,
  Moon,
  Play,
  Sun,
  Target,
  Utensils,
  Video,
  Wand2,
} from "lucide-react"
import styles from "./landing.module.css"

const appName = process.env.NEXT_PUBLIC_APP_NAME || "BECOME"
const logo = process.env.NEXT_PUBLIC_LOGO || "/logo.png"
const coachImage = "/coach-jon.webp"

// Real product captures (coach's account, shared for the site). All cropped to
// the same frame, so every phone shell can assume this ratio.
const SHOT_RATIO = "640 / 1301"

const WHY = [
  {
    Icon: LayoutGrid,
    title: "Everything in one place",
    body: "Your program, meals, mindset, and progress live together. No more juggling a workout app, a calorie app, and a notes app that never talk to each other.",
  },
  {
    Icon: Target,
    title: "A plan, not just a tracker",
    body: "Become tells you what today looks like — the workout on deck, the calories left, the next step. You open it and go.",
  },
  {
    Icon: Flame,
    title: "Built by a real coach",
    body: "Programs and habits from coach Jon Don — the same system he runs with his own clients, not content-mill filler.",
  },
] as const

const TRAINING_TABS = [
  {
    id: "programs",
    label: "Programs",
    Icon: ClipboardList,
    image: "/screenshots/become-training-hub.webp",
    alt: "Become training hub with weekly schedule and coach programs",
    title: "A program that plans your week for you.",
    body: "Pick a coach-built program and your week fills itself in — training days, rest days, and exactly what's on deck today.",
    points: ["Multi-phase progressive programs", "Weekly schedule with today queued up", "Recommended by goal and level"],
  },
  {
    id: "log",
    label: "In the workout",
    Icon: Video,
    image: "/screenshots/become-training-log.webp",
    alt: "Logging bench press sets with a demo video and last-session numbers",
    title: "Every exercise shows you how — and remembers.",
    body: "Demo videos on every movement, your last session's numbers right where you need them, and set-by-set logging with PRs tracked automatically.",
    points: ["Exercise demo videos built in", "Last session + PR history per lift", "Tap-to-complete sets with rest timers"],
  },
  {
    id: "live",
    label: "Live mode",
    Icon: Camera,
    image: "/screenshots/become-training-live.webp",
    alt: "Live mode counting cable curl reps through the phone camera",
    title: "Point your camera. It counts your reps.",
    body: "Live mode watches your set through the camera, tracks your reps in real time, and records the work — so you can stay in the set, not in the app.",
    points: ["Real-time rep counting", "Hands-free set logging", "Session recording as you train"],
  },
  {
    id: "generate",
    label: "Generate",
    Icon: Wand2,
    image: "/screenshots/become-training-generate.webp",
    alt: "Generating a custom session by focus, difficulty, and equipment",
    title: "No program? Build a session in seconds.",
    body: "Choose a focus, your level, and the equipment in front of you — or just describe the session you want and let AI write it.",
    points: ["Session or full program", "Filters for focus, level, equipment", "Describe it in plain words, get a plan"],
  },
] as const

const STEPS = [
  {
    number: "1",
    title: "Tell Become your goal",
    body: "Build muscle, lose fat, or just get consistent — your goal shapes everything that follows.",
  },
  {
    number: "2",
    title: "Get your plan",
    body: "A training program plus calorie and macro targets, matched to you. Not generic numbers.",
  },
  {
    number: "3",
    title: "Show up daily",
    body: "The app keeps every piece organized so the only thing left to do is the work.",
  },
] as const

const subscribeToNothing = () => () => {}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brand}>
      <span className={styles.brandMark}>
        <Image src={logo} alt="" width={compact ? 26 : 30} height={compact ? 26 : 30} priority={!compact} />
      </span>
      <span>{appName}</span>
    </span>
  )
}

function Phone({
  src,
  alt,
  className,
  priority = false,
  sizes = "(max-width: 800px) 68vw, 300px",
}: {
  src: string
  alt: string
  className?: string
  priority?: boolean
  sizes?: string
}) {
  return (
    <div className={className ? `${styles.phone} ${className}` : styles.phone}>
      <div className={styles.phoneScreen} style={{ aspectRatio: SHOT_RATIO }}>
        <Image src={src} alt={alt} fill priority={priority} sizes={sizes} />
      </div>
    </div>
  )
}

function SectionHeading({
  kicker,
  title,
  lead,
  dark = false,
}: {
  kicker: string
  title: string
  lead?: string
  dark?: boolean
}) {
  return (
    <header className={dark ? styles.sectionHeadDark : styles.sectionHead}>
      <span className={styles.kicker}>{kicker}</span>
      <h2>{title}</h2>
      {lead ? <p>{lead}</p> : null}
    </header>
  )
}

function FeatureList({ items, dark = false }: { items: readonly string[]; dark?: boolean }) {
  return (
    <ul className={dark ? styles.featureListDark : styles.featureList}>
      {items.map((item) => (
        <li key={item}>
          <span className={styles.featureCheck}>
            <Check size={13} strokeWidth={3} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function DashboardSection() {
  const [mode, setMode] = useState<"light" | "dark">("light")
  return (
    <section className={styles.section} id="dashboard">
      <div className={styles.shell}>
        <div className={styles.split}>
          <div className={styles.splitCopy}>
            <SectionHeading
              kicker="The Dashboard"
              title="Open the app. Know your day."
              lead="Today's workout, calories remaining, streak, mood, weight, water — one screen you can rearrange to fit how you train. That disorganized feeling ends here."
            />
            <FeatureList
              items={[
                "Today's session queued and one tap away",
                "Streaks, weekly targets, and goal progress",
                "Weight, mood, and water at a glance",
                "Customizable tiles — your dashboard, your order",
              ]}
            />
            <div className={styles.modeToggle} role="group" aria-label="Preview dashboard in light or dark mode">
              <button
                type="button"
                className={mode === "light" ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => setMode("light")}
                aria-pressed={mode === "light"}
              >
                <Sun size={15} /> Light
              </button>
              <button
                type="button"
                className={mode === "dark" ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => setMode("dark")}
                aria-pressed={mode === "dark"}
              >
                <Moon size={15} /> Dark
              </button>
              <span className={styles.modeHint}>Goes as dark as your gym playlist.</span>
            </div>
          </div>
          <div className={styles.splitVisual}>
            <div className={styles.phoneStack}>
              <div className={styles.phoneFader} data-active={mode === "light"}>
                <Phone
                  src="/screenshots/become-dashboard-light.webp"
                  alt="Become dashboard in light mode showing streak, mood, goal, and today's workout"
                />
              </div>
              <div className={styles.phoneFader} data-active={mode === "dark"}>
                <Phone
                  src="/screenshots/become-dashboard-dark.webp"
                  alt="Become dashboard in dark mode showing streak, mood, water, and today's workout"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function TrainingSection() {
  const [activeId, setActiveId] = useState<(typeof TRAINING_TABS)[number]["id"]>("programs")
  const active = TRAINING_TABS.find((tab) => tab.id === activeId) || TRAINING_TABS[0]
  return (
    <section className={styles.sectionDark} id="training">
      <div className={styles.shell}>
        <SectionHeading
          dark
          kicker="Training"
          title="Every set planned. Every rep counted."
          lead="Follow coach-built programs like The Jon Don Split — or build the exact session you need. Then log it with demo videos, PR history, and a Live mode that counts reps through your camera."
        />
        <div className={styles.trainingPanel}>
          <div className={styles.trainingCopy}>
            <div className={styles.tabRow} role="tablist" aria-label="Explore training features">
              {TRAINING_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={tab.id === active.id}
                  aria-controls="training-panel"
                  className={tab.id === active.id ? styles.tabActive : styles.tab}
                  onClick={() => setActiveId(tab.id)}
                >
                  <tab.Icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>
            <div id="training-panel" role="tabpanel">
              <h3>{active.title}</h3>
              <p>{active.body}</p>
              <FeatureList dark items={active.points} />
            </div>
          </div>
          <div className={styles.trainingVisual}>
            {TRAINING_TABS.map((tab) => (
              <div key={tab.id} className={styles.phoneFader} data-active={tab.id === active.id}>
                <Phone src={tab.image} alt={tab.alt} className={styles.phoneDark} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function NutritionSection() {
  return (
    <section className={styles.section} id="nutrition">
      <div className={styles.shell}>
        <div className={styles.splitReverse}>
          <div className={styles.splitCopy}>
            <SectionHeading
              kicker="Nutrition"
              title="Point your camera at lunch. Done."
              lead="Snap a photo and Become itemizes the whole plate — every food, portion, and calorie — against targets built for your goal."
            />
            <FeatureList
              items={[
                "Photo logging with a full itemized breakdown",
                "Personal calorie and macro targets, not generic numbers",
                "Barcode scan and fast food search",
                "Protein, carbs, and fats tracked through the day",
              ]}
            />
            <p className={styles.aside}>
              <Camera size={15} /> One photo logged an eight-item breakfast. Try that in a spreadsheet.
            </p>
          </div>
          <div className={styles.splitVisual}>
            <div className={styles.phonePair}>
              <Phone
                src="/screenshots/become-nutrition-day.webp"
                alt="Daily calories ring with macro targets in Become"
                className={styles.phoneBack}
                sizes="(max-width: 800px) 58vw, 260px"
              />
              <Phone
                src="/screenshots/become-nutrition-meal.webp"
                alt="A photo-logged breakfast itemized into eight foods with calories"
                className={styles.phoneFront}
                sizes="(max-width: 800px) 58vw, 260px"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MindProgressSection() {
  return (
    <section className={styles.section} id="mind">
      <div className={styles.shell}>
        <div className={styles.duoGrid}>
          <article className={styles.duoCard}>
            <div className={styles.duoHead}>
              <span className={styles.duoIcon} data-tone="violet">
                <Brain size={18} />
              </span>
              <h3>Mind</h3>
            </div>
            <p>
              Consistency is a mental game, so the strongest muscle gets its own tab: short guided sessions, mood
              tracking, and identity work for the days motivation doesn&apos;t show up.
            </p>
            <FeatureList
              items={["Daily guided mental sessions", "Mood check-ins and 7-day trends", "Identity and habit work that sticks"]}
            />
            <div className={styles.duoShot} style={{ aspectRatio: "720 / 860" }}>
              <Image
                src="/screenshots/become-mind-card.webp"
                alt="Become Mindset hub: you are not your current circumstances"
                fill
                sizes="(max-width: 800px) 86vw, 380px"
              />
            </div>
          </article>
          <article className={styles.duoCard}>
            <div className={styles.duoHead}>
              <span className={styles.duoIcon} data-tone="gold">
                <LineChart size={18} />
              </span>
              <h3>Progress &amp; The Becoming</h3>
            </div>
            <p>
              Weight trends, PRs, and streaks show the line moving. And every week, The Becoming writes the week back to
              you — what held, what slipped, what&apos;s next. Evidence, not vibes.
            </p>
            <FeatureList
              items={["Weight, strength, and streak trends", "A weekly recap across training, food, and mind", "Milestones when goals are reached"]}
            />
            <div className={styles.duoShot} style={{ aspectRatio: "720 / 826" }}>
              <Image
                src="/screenshots/become-progress-card.webp"
                alt="The Becoming weekly summary with streak, mood, goal reached, and weight tiles"
                fill
                sizes="(max-width: 800px) 86vw, 380px"
              />
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

export default function BecomeLanding() {
  const reduced = useReducedMotion()
  const isLoggedIn = useSyncExternalStore(
    subscribeToNothing,
    () => Boolean(localStorage.getItem("token")),
    () => false,
  )

  const rise = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
        } as const)

  return (
    <main className={styles.root}>
      <nav className={styles.nav} aria-label="Main navigation">
        <div className={styles.navShell}>
          <Link href="/" aria-label={appName + " home"}>
            <BrandMark />
          </Link>
          <div className={styles.navLinks}>
            <a href="#dashboard">Dashboard</a>
            <a href="#training">Training</a>
            <a href="#nutrition">Nutrition</a>
            <a href="#mind">Mind</a>
            <a href="#coach">Coach</a>
          </div>
          <div className={styles.navActions}>
            <Link className={styles.signIn} href={isLoggedIn ? "/dashboard" : "/login"}>
              {isLoggedIn ? "Open app" : "Sign in"}
            </Link>
            <Link className={styles.navCta} href="/register">
              Get started <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroShell}>
          <div className={styles.heroCopy}>
            <motion.p className={styles.heroEyebrow} {...rise(0)}>
              <Dumbbell size={14} /> Training <span aria-hidden="true">·</span> <Utensils size={14} /> Nutrition{" "}
              <span aria-hidden="true">·</span> <Brain size={14} /> Mind
            </motion.p>
            <motion.h1 {...rise(0.06)}>
              The only fitness app your goal actually needs.
            </motion.h1>
            <motion.p className={styles.heroLead} {...rise(0.14)}>
              Coach-built programs, photo-powered nutrition tracking, live workout logging, and daily mindset work —
              organized into one clear plan, so you always know exactly what to do next.
            </motion.p>
            <motion.div className={styles.heroActions} {...rise(0.22)}>
              <Link className={styles.primaryCta} href="/register">
                Get started <ArrowRight size={18} />
              </Link>
              <a className={styles.secondaryCta} href="#why">
                See what&apos;s inside
              </a>
            </motion.div>
            <motion.p className={styles.heroFootnote} {...rise(0.3)}>
              Built by coach Jon Don · Sign up with just your email
            </motion.p>
          </div>
          <motion.div
            className={styles.heroVisual}
            initial={reduced ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.heroGlow} aria-hidden="true" />
            <Phone
              src="/screenshots/become-dashboard-light.webp"
              alt="Become dashboard showing today's workout, streak, mood, and goal progress"
              className={styles.heroPhoneBack}
              priority
              sizes="(max-width: 800px) 60vw, 280px"
            />
            <Phone
              src="/screenshots/become-training-live.webp"
              alt="Become Live mode counting reps through the camera during a workout"
              className={styles.heroPhoneFront}
              priority
              sizes="(max-width: 800px) 60vw, 280px"
            />
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} aria-hidden="true" />
              Live rep counting
            </div>
          </motion.div>
        </div>
      </section>

      <section className={styles.why} id="why">
        <div className={styles.shell}>
          <SectionHeading
            kicker="Why Become"
            title="You don't need more apps. You need one that has everything."
            lead="Most people quit because their plan is scattered across four apps and a notes file. Become puts the whole system on one screen."
          />
          <div className={styles.whyGrid}>
            {WHY.map((item) => (
              <article key={item.title} className={styles.whyCard}>
                <span className={styles.whyIcon}>
                  <item.Icon size={19} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <DashboardSection />
      <TrainingSection />
      <NutritionSection />
      <MindProgressSection />

      <section className={styles.steps} id="how">
        <div className={styles.shell}>
          <SectionHeading
            kicker="How it works"
            title="Three steps to day one."
          />
          <ol className={styles.stepsGrid}>
            {STEPS.map((step) => (
              <li key={step.number} className={styles.stepCard}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.coach} id="coach">
        <div className={styles.shell}>
          <div className={styles.coachCard}>
            <div className={styles.coachPhoto}>
              <Image src={coachImage} alt="Coach Jon Don" fill sizes="(max-width: 800px) 40vw, 220px" />
            </div>
            <div className={styles.coachCopy}>
              <span className={styles.kicker}>The coach</span>
              <h2>Real programming, from a real coach.</h2>
              <p>
                Become is the system coach Jon Don uses with his own clients — the programs, the nutrition targets, the
                mindset work. You&apos;re not following an algorithm&apos;s guess. You&apos;re following a coach&apos;s
                system, with the tools to run it yourself.
              </p>
              <div className={styles.coachMeta}>
                <span>
                  <Play size={14} /> Demo videos on every exercise
                </span>
                <span>
                  <Calendar size={14} /> Programs that plan your week
                </span>
                <span>
                  <Utensils size={14} /> Nutrition targets set to your goal
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.closing}>
        <div className={styles.shell}>
          <div className={styles.closingInner}>
            <BrandMark compact />
            <h2>Ready to become?</h2>
            <p>Your first workout is minutes away. Sign up with your email — no credit card, no fuss.</p>
            <div className={styles.closingActions}>
              <Link className={styles.primaryCta} href="/register">
                Start today <ArrowRight size={18} />
              </Link>
              <Link className={styles.closingSignIn} href={isLoggedIn ? "/dashboard" : "/login"}>
                {isLoggedIn ? "Open the app" : "Already a member? Sign in"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.shell}>
          <div className={styles.footerRow}>
            <BrandMark compact />
            <p>Training · Nutrition · Mind — one app.</p>
            <div className={styles.footerLinks}>
              <Link href="/login">Sign in</Link>
              <Link href="/register">Register</Link>
              <Link href="/information">Info</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
