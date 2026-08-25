"use client"

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import Image from "next/image"
import Link from "next/link"
import {
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionProps,
} from "framer-motion"
import {
  ArrowRight,
  Brain,
  Calendar,
  Check,
  ClipboardList,
  Dumbbell,
  Flame,
  LayoutGrid,
  Moon,
  Play,
  Sun,
  Target,
  Utensils,
  Video,
  Wand2,
} from "lucide-react"
import HeroLine from "./HeroLine"
import Marquee from "./Marquee"
import Phone from "./Phone"
import { SpineDot, SpineRail } from "./Spine"
import { useCountUp, useReducedMotionSafe, useSiteTheme } from "./hooks"
import styles from "./landing.module.css"

const appName = process.env.NEXT_PUBLIC_APP_NAME || "BECOME"
const logo = process.env.NEXT_PUBLIC_LOGO || "/logo.png"

/** Fresh captures from the demo account — see public/screenshots/v2/manifest.json. */
const shot = (name: string) => `/screenshots/v2/${name}.webp`

const EASE = [0.22, 1, 0.36, 1] as const

const WHY = [
  {
    Icon: LayoutGrid,
    title: "Everything in one place",
    body: "Your program, meals, mindset, and progress live together. No more juggling a workout app, a calorie app, and a notes file that never talk to each other.",
    tone: "green",
  },
  {
    Icon: Target,
    title: "A plan, not just a tracker",
    body: "Become tells you what today looks like — the workout on deck, the calories left, the next step. You open it and go.",
    tone: "red",
  },
  {
    Icon: Flame,
    title: "Built by a real coach",
    body: "Programs and habits from coach Jon Don — the same system he runs with his own clients, not content-mill filler.",
    tone: "gold",
  },
] as const

const TRAINING_TABS = [
  {
    id: "programs",
    label: "Programs",
    Icon: ClipboardList,
    image: shot("workout-hub-light"),
    imageDark: shot("workout-hub-dark") as string | undefined,
    alt: "Become training hub showing this week's schedule and a program at 50% complete",
    /* the strip follows the capture's own top row, per theme */
    statusTint: "#fefefe" as string | undefined,
    statusTintDark: undefined as string | undefined,
    title: "A program that plans your week for you.",
    body: "Pick a coach-built program and the week fills itself in — training days, rest days, and exactly what's on deck today.",
    points: [
      "Multi-phase progressive programs",
      "Weekly schedule with today queued up",
      "Recommended by your goal and level",
    ],
  },
  {
    id: "log",
    label: "In the workout",
    Icon: Video,
    image: shot("workout-log-dark"),
    /* the live logger is dark in both app themes — one capture, no swap */
    imageDark: undefined as string | undefined,
    alt: "Logging a lat pulldown set with the demo video playing full screen behind the controls",
    statusTint: undefined as string | undefined,
    statusTintDark: undefined as string | undefined,
    title: "The big lifts show you how — and it remembers.",
    body: "The demo plays full screen behind your set, your last session's numbers sit right where you need them, and PRs are tracked as you go.",
    points: [
      "Demo videos on the big lifts",
      "Last session and PR history per lift",
      "Set-by-set logging with rest timers",
    ],
  },
  {
    id: "generate",
    label: "Generate",
    Icon: Wand2,
    image: shot("generate-light"),
    imageDark: shot("generate-dark") as string | undefined,
    alt: "Generating a pull session filtered by difficulty and available equipment",
    /* this capture opens over a dimmed hub, so the status strip matches that
       grey — and its dark twin dims to near-black instead */
    statusTint: "#7f7f7f",
    statusTintDark: "#0d0b0d" as string | undefined,
    title: "No program? Build a session in seconds.",
    body: "Choose a focus, your level, and the equipment actually in front of you — or describe the session you want and let it write the plan.",
    points: ["Single session or a full program", "Filters for focus, level, equipment", "Tuned to what your gym has today"],
  },
] as const

const STEPS = [
  {
    number: 1,
    title: "Tell Become your goal",
    body: "Build muscle, lose fat, or just get consistent — your goal shapes everything that follows.",
  },
  {
    number: 2,
    title: "Get your plan",
    body: "A training program plus calorie and macro targets matched to you. Not generic numbers.",
  },
  {
    number: 3,
    title: "Show up daily",
    body: "The app keeps every piece organized, so the only thing left to do is the work.",
  },
] as const

const HERO_CHIPS = [
  { id: "set", Icon: Check, label: "Set complete", value: "150 lbs × 10", tone: "green" },
  { id: "streak", Icon: Flame, label: "Streak", value: "+1 day", tone: "gold" },
  { id: "protein", Icon: Utensils, label: "Protein", value: "156 / 150g", tone: "red" },
] as const

const STATS = [
  { value: 12, label: "week programs" },
  { value: 7, label: "day recap, weekly" },
  { value: 3, label: "practices, one plan" },
] as const

const subscribeToNothing = () => () => {}

/* ── Small shared pieces ──────────────────────────────────────────────────── */

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

function Reveal({
  children,
  delay = 0,
  className,
  amount = 0.25,
}: {
  children: ReactNode
  delay?: number
  className?: string
  amount?: number
}) {
  const reduced = useReducedMotionSafe()
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={reduced ? { duration: 0 } : { duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

function SectionHeading({
  kicker,
  title,
  lead,
  dark = false,
  tone = "green",
}: {
  kicker: string
  title: string
  lead?: string
  dark?: boolean
  tone?: "green" | "violet" | "gold" | "red"
}) {
  return (
    <Reveal className={dark ? styles.sectionHeadDark : styles.sectionHead}>
      <span className={styles.kicker} data-tone={tone}>
        {kicker}
      </span>
      <h2>{title}</h2>
      {lead ? <p>{lead}</p> : null}
    </Reveal>
  )
}

function FeatureList({
  items,
  dark = false,
  tone = "green",
}: {
  items: readonly string[]
  dark?: boolean
  tone?: "green" | "violet" | "gold"
}) {
  return (
    <ul className={dark ? styles.featureListDark : styles.featureList} data-tone={tone}>
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

/* ── Nav ──────────────────────────────────────────────────────────────────── */

function Nav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const reduced = useReducedMotionSafe()
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)
  const [lifted, setLifted] = useState(false)
  const previous = useRef(0)

  useMotionValueEvent(scrollY, "change", (latest) => {
    const delta = latest - previous.current
    previous.current = latest
    setLifted(latest > 12)
    if (latest < 120) {
      setHidden(false)
      return
    }
    if (delta > 6) setHidden(true)
    else if (delta < -6) setHidden(false)
  })

  return (
    <motion.nav
      className={styles.nav}
      data-lifted={lifted ? "true" : "false"}
      aria-label="Main navigation"
      animate={{ y: hidden && !reduced ? "-105%" : "0%" }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 40 }}
    >
      <div className={styles.navShell}>
        <Link href="/" aria-label={`${appName} home`}>
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
    </motion.nav>
  )
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

function HeroChips() {
  const reduced = useReducedMotionSafe()
  return (
    <>
      {HERO_CHIPS.map((chip, index) => (
        <motion.span
          key={chip.id}
          className={styles.heroChip}
          data-slot={chip.id}
          data-tone={chip.tone}
          aria-hidden="true"
          initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          animate={
            reduced
              ? { opacity: 1, y: 0 }
              : { opacity: [0, 1, 1, 0, 0], y: [10, 0, 0, -8, -8] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: 21,
                  times: [0, 0.035, 0.2, 0.235, 1],
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1.4 + index * 7,
                }
          }
        >
          <span className={styles.heroChipIcon}>
            <chip.Icon size={13} strokeWidth={2.6} />
          </span>
          <span className={styles.heroChipLabel}>{chip.label}</span>
          <strong>{chip.value}</strong>
        </motion.span>
      ))}
    </>
  )
}

function Hero() {
  const reduced = useReducedMotionSafe()
  const rise = (delay: number): MotionProps =>
    reduced
      ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: EASE },
        }

  const float = (duration: number, drift: number): MotionProps =>
    reduced
      ? { animate: { y: 0, rotate: 0 }, transition: { duration: 0 } }
      : {
          animate: { y: [0, -8, 0], rotate: [0, drift, 0] },
          transition: { duration, repeat: Infinity, ease: "easeInOut", delay: 0.9 },
        }

  return (
    <section className={styles.hero}>
      <div className={styles.heroBlobs} aria-hidden="true">
        <span data-blob="a" />
        <span data-blob="b" />
      </div>
      <div className={styles.heroShell}>
        <div className={styles.heroCopy}>
          <motion.p className={styles.heroEyebrow} {...rise(0)}>
            <Dumbbell size={14} /> Training <span aria-hidden="true">·</span> <Utensils size={14} /> Nutrition{" "}
            <span aria-hidden="true">·</span> <Brain size={14} /> Mind
          </motion.p>
          <h1 className={styles.heroTitle}>
            <motion.span {...rise(0.06)}>The only fitness app</motion.span>
            <motion.span {...rise(0.12)}>your goal actually</motion.span>
            <motion.span {...rise(0.18)}>needs.</motion.span>
          </h1>
          <motion.p className={styles.heroLead} {...rise(0.2)}>
            Coach-built programs, photo-powered nutrition tracking, live workout logging, and daily mindset work —
            organized into one clear plan, so you always know exactly what to do next.
          </motion.p>
          <motion.div className={styles.heroActions} {...rise(0.34)}>
            <Link className={styles.primaryCta} href="/register">
              Get started <ArrowRight size={18} className={styles.ctaArrow} />
            </Link>
            <a className={styles.secondaryCta} href="#why">
              See what&apos;s inside
            </a>
          </motion.div>
          <motion.p className={styles.heroFootnote} {...rise(0.42)}>
            Built by coach Jon Don · Sign up with just your email
          </motion.p>
        </div>

        <div className={styles.heroStage}>
          <HeroLine />
          <div className={styles.heroGlow} aria-hidden="true" />
          <motion.div
            className={styles.heroPhoneBack}
            initial={reduced ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 18, delay: 0.25 }}
          >
            <motion.div {...float(6.5, -0.6)}>
              <Phone
                src={shot("dashboard-light")}
                srcDark={shot("dashboard-dark")}
                alt="Become dashboard showing today's streak, mood, goal progress, and calories"
                className={styles.tiltLeft}
                priority
                sizes="(max-width: 800px) 52vw, 260px"
              />
            </motion.div>
          </motion.div>
          <motion.div
            className={styles.heroPhoneFront}
            initial={reduced ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 56, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 18, delay: 0.4 }}
          >
            <motion.div {...float(7.6, 0.7)}>
              <Phone
                src={shot("workout-log-dark")}
                alt="Logging a lat pulldown set in Become with the exercise demo playing behind it"
                className={styles.tiltRight}
                priority
                tone="dark"
                island={false}
                sizes="(max-width: 800px) 52vw, 260px"
              />
            </motion.div>
          </motion.div>
          <HeroChips />
        </div>
      </div>
    </section>
  )
}

/* ── Why ──────────────────────────────────────────────────────────────────── */

function WhySection() {
  return (
    <section className={styles.why} id="why">
      <SpineDot tone="violet" top={96} />
      <div className={styles.shell}>
        <SectionHeading
          kicker="Why Become"
          title="You don't need more apps. You need one that has everything."
          lead="Most people quit because their plan is scattered across four apps and a notes file. Become puts the whole system on one screen."
        />
        <div className={styles.whyGrid}>
          {WHY.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.08} className={styles.whyCell} amount={0.3}>
              <article className={styles.whyCard}>
                <span className={styles.whyIcon} data-tone={item.tone}>
                  <item.Icon size={19} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */

function DashboardSection() {
  const reduced = useReducedMotionSafe()
  const siteTheme = useSiteTheme()
  const otherTheme = siteTheme === "dark" ? "light" : "dark"
  const stageRef = useRef<HTMLDivElement>(null)
  const inView = useInView(stageRef, { once: true, amount: 0.4 })
  /* The demo rests on the variant the visitor is already looking at — the app
     matching their device — and only departs from it to show the other one off
     (or when they pick). `null` means "follow the site", so a live OS theme
     change is picked up here too. */
  const [override, setOverride] = useState<"light" | "dark" | null>(null)
  const [autoDone, setAutoDone] = useState(false)
  const mode = override ?? siteTheme

  useEffect(() => {
    if (!inView || autoDone || reduced) return
    const away = window.setTimeout(() => setOverride(otherTheme), 650)
    const back = window.setTimeout(() => {
      setOverride(null)
      setAutoDone(true)
    }, 1850)
    return () => {
      window.clearTimeout(away)
      window.clearTimeout(back)
    }
  }, [inView, autoDone, reduced, otherTheme])

  const pick = (next: "light" | "dark") => {
    setAutoDone(true)
    setOverride(next)
  }

  return (
    <section className={styles.section} id="dashboard">
      <SpineDot tone="violet" top={110} />
      <div className={styles.shell}>
        <div className={styles.split}>
          <div className={styles.splitCopy}>
            <SectionHeading
              kicker="The Dashboard"
              title="Open the app. Know your day."
              lead="Today's session, calories remaining, streak, mood, weight — one screen you can rearrange to fit how you train. That scattered feeling ends here."
            />
            <Reveal delay={0.06}>
              <FeatureList
                items={[
                  "Today's session queued and one tap away",
                  "Streaks, weekly targets, and goal progress",
                  "Weight, mood, and calories at a glance",
                  "Customizable tiles — your dashboard, your order",
                ]}
              />
              <div className={styles.modeToggle} role="group" aria-label="Preview the dashboard in light or dark mode">
                <button
                  type="button"
                  className={mode === "light" ? styles.modeBtnActive : styles.modeBtn}
                  onClick={() => pick("light")}
                  aria-pressed={mode === "light"}
                >
                  <Sun size={15} /> Light
                </button>
                <button
                  type="button"
                  className={mode === "dark" ? styles.modeBtnActive : styles.modeBtn}
                  onClick={() => pick("dark")}
                  aria-pressed={mode === "dark"}
                >
                  <Moon size={15} /> Dark
                </button>
                <span className={styles.modeHint}>Goes as dark as your gym playlist.</span>
              </div>
            </Reveal>
          </div>
          <div className={styles.splitVisual}>
            <div className={styles.dashStage}>
              <span className={styles.dashPlate} aria-hidden="true" />
              <motion.div
                ref={stageRef}
                className={styles.phoneStack}
                initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE }}
              >
                <div className={styles.phoneFader} data-active={mode === "light"}>
                  <Phone
                    src={shot("dashboard-light")}
                    alt="Become dashboard in light mode with streak, mood, goal, and calorie tiles"
                    sizes="(max-width: 800px) 70vw, 288px"
                  />
                </div>
                <div className={styles.phoneFader} data-active={mode === "dark"}>
                  <Phone
                    src={shot("dashboard-dark")}
                    alt="The same Become dashboard in dark mode"
                    tone="dark"
                    sizes="(max-width: 800px) 70vw, 288px"
                  />
                </div>
              </motion.div>
              <Reveal delay={0.18} amount={0.4} className={`${styles.dashChip} ${styles.dashChipStreak}`}>
                <Flame size={14} /> Streak <strong>10 days</strong>
              </Reveal>
              <Reveal delay={0.26} amount={0.4} className={`${styles.dashChip} ${styles.dashChipTiles}`}>
                <LayoutGrid size={14} /> <strong>Drag</strong> to reorder tiles
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Training (dark, auto-advancing tabs) ─────────────────────────────────── */

function TrainingSection() {
  const reduced = useReducedMotionSafe()
  const panelRef = useRef<HTMLDivElement>(null)
  const inView = useInView(panelRef, { amount: 0.3 })
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const running = inView && !paused && !reduced
  const active = TRAINING_TABS[index]

  useEffect(() => {
    if (!running) return
    const id = window.setTimeout(() => setIndex((current) => (current + 1) % TRAINING_TABS.length), 5000)
    return () => window.clearTimeout(id)
  }, [running, index])

  const choose = (next: number) => {
    setPaused(true)
    setIndex(next)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = TRAINING_TABS.length - 1
    let next: number
    if (event.key === "ArrowRight") next = (index + 1) % TRAINING_TABS.length
    else if (event.key === "ArrowLeft") next = (index - 1 + TRAINING_TABS.length) % TRAINING_TABS.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = last
    else return
    event.preventDefault()
    choose(next)
    const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")
    tabs[next]?.focus()
  }

  return (
    <section className={styles.sectionDark} id="training">
      <SpineDot tone="red" top={110} />
      <div className={styles.shell}>
        <SectionHeading
          dark
          kicker="Training"
          title="Every set planned. Every rep logged."
          lead="Follow a coach-built program, or generate the exact session your gym can support today. Then log it with demo videos, last-session numbers, and PRs tracked for you."
        />
        <div className={styles.trainingBody} ref={panelRef}>
          <div className={styles.tabRow} role="tablist" aria-label="Explore training" onKeyDown={onKeyDown}>
            {TRAINING_TABS.map((tab, tabIndex) => {
              const isActive = tabIndex === index
              return (
                <button
                  key={tab.id}
                  id={`training-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  aria-controls="training-panel"
                  className={isActive ? styles.tabActive : styles.tab}
                  onClick={() => choose(tabIndex)}
                >
                  <tab.Icon size={16} />
                  {tab.label}
                  {isActive && running ? (
                    <motion.span
                      key={`bar-${index}`}
                      className={styles.tabProgress}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 5, ease: "linear" }}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
          <div
            className={styles.trainingPanel}
            onMouseEnter={() => setPaused(true)}
            onFocusCapture={() => setPaused(true)}
          >
            <div
              id="training-panel"
              role="tabpanel"
              aria-labelledby={`training-tab-${active.id}`}
              className={styles.trainingText}
            >
              <motion.div
                key={active.id}
                initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
              >
                <h3>{active.title}</h3>
                <p>{active.body}</p>
                <FeatureList dark items={active.points} />
              </motion.div>
            </div>
            <div className={styles.trainingVisual}>
              {TRAINING_TABS.map((tab, tabIndex) => (
                <div key={tab.id} className={styles.phoneSlide} data-active={tabIndex === index}>
                  <Phone
                    src={tab.image}
                    srcDark={tab.imageDark}
                    alt={tab.alt}
                    tone="dark"
                    island={tab.id !== "log"}
                    statusTint={tab.statusTint}
                    statusTintDark={tab.statusTintDark}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Nutrition (parallax pair) ────────────────────────────────────────────── */

function NutritionSection() {
  const reduced = useReducedMotionSafe()
  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] })
  const yBack = useTransform(scrollYProgress, [0, 1], [26, -22])
  const yFront = useTransform(scrollYProgress, [0, 1], [-20, 28])

  return (
    <section className={styles.section} id="nutrition">
      <SpineDot tone="red" top={110} />
      <div className={styles.shell}>
        <div className={styles.splitReverse}>
          <div className={styles.splitCopy}>
            <SectionHeading
              kicker="Nutrition"
              title="Point your camera at lunch. Done."
              lead="Snap a photo and Become itemizes the whole plate — every food, portion, and calorie — against targets built for your goal."
            />
            <Reveal delay={0.06}>
              <FeatureList
                items={[
                  "Photo logging with a full itemized breakdown",
                  "Personal calorie and macro targets, not generic numbers",
                  "Barcode scan and fast food search",
                  "Protein, carbs, and fats tracked through the day",
                ]}
              />
              <p className={styles.aside}>
                <Flame size={15} /> 263 calories left, and protein is already past target.
              </p>
            </Reveal>
          </div>
          <div className={styles.splitVisual} ref={sectionRef}>
            <div className={styles.phonePair}>
              <motion.div className={styles.phoneBack} style={reduced ? { y: 0 } : { y: yBack }}>
                <Phone
                  src={shot("nutrition-day-light")}
                  srcDark={shot("nutrition-day-dark")}
                  alt="Daily calorie ring with protein, carb, and fat targets in Become"
                  className={styles.tiltLeft}
                  sizes="(max-width: 800px) 46vw, 230px"
                />
              </motion.div>
              <motion.div className={styles.phoneFront} style={reduced ? { y: 0 } : { y: yFront }}>
                <Phone
                  src={shot("nutrition-meal-light")}
                  srcDark={shot("nutrition-meal-dark")}
                  alt="A logged breakfast broken out into eggs, oatmeal, and blueberries with calories per item"
                  className={styles.tiltRight}
                  island={false}
                  sizes="(max-width: 800px) 46vw, 230px"
                />
              </motion.div>
              <motion.span
                className={styles.macroChip}
                aria-hidden="true"
                initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.35, ease: EASE }}
              >
                <em>466</em> cal · breakfast, itemized
              </motion.span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Mind ─────────────────────────────────────────────────────────────────── */

function MindSection() {
  return (
    <section className={styles.mind} id="mind">
      <SpineDot tone="green" top={110} />
      <div className={styles.shell}>
        <Reveal amount={0.2}>
          <div className={styles.mindBand}>
            <div className={styles.mindCopy}>
              <SectionHeading
                dark
                kicker="Mind"
                tone="violet"
                title="Train the part that decides to show up."
                lead="Consistency is a mental game, so the strongest muscle gets its own tab: short guided sessions, identity work, and a mood check-in that takes five seconds."
              />
              <FeatureList
                dark
                tone="violet"
                items={[
                  "Short daily sessions — most run under three minutes",
                  "Identity and mission work that unlocks as you go",
                  "Mood check-ins that feed your weekly recap",
                ]}
              />
              <p className={styles.mindNote}>
                <Brain size={15} /> Five seconds today is what makes week seven possible.
              </p>
            </div>
            <div className={styles.mindVisual}>
              <Phone
                src={shot("mind-light")}
                srcDark={shot("mind-dark")}
                alt="Become Mindset hub with a suggested session and unlocked training grounds"
                tone="dark"
                statusTint="#fefefe"
                sizes="(max-width: 800px) 62vw, 262px"
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Progress & The Becoming ──────────────────────────────────────────────── */

function StatCounter({ value, label, delay }: { value: number; label: string; delay: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const shown = useCountUp(value, inView, 900 + delay * 400)

  return (
    <div className={styles.stat} ref={ref}>
      <span className={styles.statValue}>{shown}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function ProgressSection() {
  return (
    <section className={styles.progress} id="progress">
      <SpineDot tone="gold" top={110} />
      <div className={styles.shell}>
        <div className={styles.progressTop}>
          <div className={styles.progressCopy}>
            <SectionHeading
              kicker="Progress · The Becoming"
              tone="gold"
              title="Your weeks become evidence."
              lead="Volume, PRs, and streaks draw the line you're actually on. Then every week The Becoming writes it back to you — what held, what slipped, what's next."
            />
            <Reveal delay={0.06}>
              <FeatureList
                tone="gold"
                items={[
                  "Weekly volume, workout history, and personal records",
                  "Weight, mood, and streaks trending together",
                  "A weekly recap across training, food, and mind",
                ]}
              />
            </Reveal>
          </div>
          <div className={styles.progressVisual}>
            <span className={styles.progressPanel} aria-hidden="true" />
            <Reveal delay={0.1} amount={0.2} className={styles.progressPhone}>
              <Phone
                src={shot("progress-light")}
                srcDark={shot("progress-dark")}
                alt="Become training log with a weekly volume chart, workout history, and a PR badge"
                sizes="(max-width: 800px) 72vw, 300px"
              />
            </Reveal>
          </div>
        </div>
        <Reveal delay={0.05} amount={0.4} className={styles.statBand}>
          {STATS.map((stat, index) => (
            <StatCounter key={stat.label} value={stat.value} label={stat.label} delay={index} />
          ))}
        </Reveal>
      </div>
    </section>
  )
}

/* ── How it works ─────────────────────────────────────────────────────────── */

function StepsSection() {
  const reduced = useReducedMotionSafe()
  return (
    <section className={styles.steps} id="how">
      <SpineDot tone="gold" top={96} />
      <div className={styles.shell}>
        <SectionHeading kicker="How it works" title="Three steps to day one." />
        <div className={styles.stepsWrap}>
          <span className={styles.stepsRail} aria-hidden="true" />
          <ol className={styles.stepsGrid}>
            {STEPS.map((step, index) => (
              <li key={step.number} className={styles.stepCard}>
                <motion.span
                  className={styles.stepNumber}
                  initial={reduced ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 400, damping: 20, delay: index * 0.16 }
                  }
                >
                  {step.number}
                </motion.span>
                <Reveal delay={0.1 + index * 0.16} amount={0.4}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/* ── Coach ────────────────────────────────────────────────────────────────── */

function CoachSection() {
  return (
    <section className={styles.coach} id="coach">
      <SpineDot tone="gold" top={64} />
      <div className={styles.shell}>
        <Reveal amount={0.2}>
          <figure className={styles.coachCard}>
            <span className={styles.coachQuoteMark} aria-hidden="true">
              &ldquo;
            </span>
            <blockquote>
              You don&apos;t need another app. You need a system you&apos;ll actually follow.
            </blockquote>
            <figcaption className={styles.coachBy}>
              <span className={styles.coachAvatar}>
                <Image src="/profile.jpg" alt="" width={72} height={72} sizes="72px" />
              </span>
              <span>
                <strong>Jon Don</strong>
                <em>Founder &amp; Head Coach</em>
              </span>
            </figcaption>
            <div className={styles.coachMeta}>
              <span>
                <Play size={14} /> Demo videos on the big lifts
              </span>
              <span>
                <Calendar size={14} /> Programs that plan your week
              </span>
              <span>
                <Utensils size={14} /> Nutrition targets set to your goal
              </span>
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Closing ──────────────────────────────────────────────────────────────── */

function ClosingSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const reduced = useReducedMotionSafe()
  return (
    <section className={styles.closing}>
      {/* Desktop terminator: the gutter spine turns and dies on the CTA card. */}
      <motion.div
        className={styles.closingElbow}
        aria-hidden="true"
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, amount: 0.6 }}
      >
        {/* the clip lives on an inner layer: a clip-path on the observed element
            itself zeroes its intersection rect, so whileInView would never fire */}
        <motion.span
          className={styles.closingElbowInner}
          variants={{
            /* negative side insets so the terminator dot, which overhangs the
               box on both edges, is not sliced by the reveal clip */
            hidden: { clipPath: reduced ? "inset(0 -10px 0% -4px)" : "inset(0 -10px 100% -4px)" },
            shown: { clipPath: "inset(0 -10px 0% -4px)" },
          }}
          transition={reduced ? { duration: 0 } : { duration: 0.75, ease: EASE }}
        >
          <span className={styles.closingElbowStem} />
          <span className={styles.closingElbowTurn} />
          <span className={styles.closingElbowDot} />
        </motion.span>
      </motion.div>
      <div className={styles.shell}>
        <div className={styles.closingRail} aria-hidden="true">
          <motion.span
            className={styles.closingRailLine}
            initial={reduced ? { scaleY: 1 } : { scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE }}
          />
          <motion.span
            className={styles.closingRailDot}
            initial={reduced ? { scale: 1 } : { scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={
              reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 18, delay: 0.55 }
            }
          />
        </div>
        <Reveal amount={0.2} className={styles.closingInner}>
          <BrandMark compact />
          <h2>Ready to become?</h2>
          <p>Your first workout is minutes away. Sign up with your email — no credit card, no fuss.</p>
          <div className={styles.closingActions}>
            <Link className={styles.primaryCta} href="/register">
              Start today <ArrowRight size={18} className={styles.ctaArrow} />
            </Link>
            <Link className={styles.closingSignIn} href={isLoggedIn ? "/dashboard" : "/login"}>
              {isLoggedIn ? "Open the app" : "Already a member? Sign in"}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function BecomeLanding() {
  const isLoggedIn = useSyncExternalStore(
    subscribeToNothing,
    () => Boolean(localStorage.getItem("token")),
    () => false,
  )

  return (
    <main className={styles.root}>
      <Nav isLoggedIn={isLoggedIn} />
      <Hero />
      <Marquee />

      <SpineRail>
        <WhySection />
        <DashboardSection />
        <TrainingSection />
        <NutritionSection />
        <MindSection />
        <ProgressSection />
        <StepsSection />
        <CoachSection />
      </SpineRail>
      {/* Outside the rail on purpose: the spine runs to the rail's exact bottom
          edge, and the closing elbow picks it up from there without a gap. */}
      <ClosingSection isLoggedIn={isLoggedIn} />

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
