"use client"

import type { CSSProperties, ReactNode } from "react"
import { useState, useSyncExternalStore } from "react"
import Image from "next/image"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  Brain,
  Check,
  ChevronRight,
  Dumbbell,
  Flame,
  Sparkles,
  Utensils,
} from "lucide-react"
import styles from "./landing.module.css"

const appName = process.env.NEXT_PUBLIC_APP_NAME || "BECOME"
const logo = process.env.NEXT_PUBLIC_LOGO || "/logo.png"

const SYSTEMS = [
  {
    id: "mind",
    number: "01",
    label: "Mind",
    title: "Train the part that wants to quit.",
    body: "A short daily practice turns mood, reflection, and honest wins into a mindset you can actually build on.",
    details: ["Daily guided sessions", "Identity and chapter work", "Wins, streaks, and patterns"],
    image: "/screenshots/ss-mind.png",
    alt: "Become Mind practice",
    color: "#A78BFA",
    Icon: Brain,
  },
  {
    id: "fuel",
    number: "02",
    label: "Fuel",
    title: "Eat with context, not guilt.",
    body: "Targets shaped around your body and goal. Fast logging when you need it. A clear read on the week when you do not.",
    details: ["Personal calorie and macro targets", "Food, barcode, and meal tools", "Daily and weekly context"],
    image: "/screenshots/ss-nutrition.png",
    alt: "Become nutrition tracking",
    color: "#F87171",
    Icon: Utensils,
  },
  {
    id: "training",
    number: "03",
    label: "Training",
    title: "Make every session answer the last.",
    body: "Follow a real program or build the session you need. Become remembers the sets, swaps, and records that move the next workout forward.",
    details: ["Progressive programs", "Live sets, reps, and swaps", "PR and training history"],
    image: "/screenshots/ss-programming.png",
    alt: "Become training programs",
    color: "#4ADE80",
    Icon: Dumbbell,
  },
] as const

const WEEKS = [
  {
    label: "Week 01",
    dates: "Jan 5–11",
    headline: "You began before you felt ready.",
    note: "Two workouts. Two honest check-ins. The line exists now.",
    identity: "I am someone who comes back.",
    mind: 2,
    fuel: 0,
    training: 2,
    color: "#A78BFA",
  },
  {
    label: "Week 04",
    dates: "Jan 26–Feb 1",
    headline: "The routine stopped needing a speech.",
    note: "You trained four times and fueled the work on five days.",
    identity: "I keep the next promise.",
    mind: 4,
    fuel: 5,
    training: 4,
    color: "#4ADE80",
  },
  {
    label: "This week",
    dates: "Feb 16–22",
    headline: "All three are moving together.",
    note: "The strongest week is not perfect. It is legible—and still alive.",
    identity: "I do the work that makes tomorrow easier.",
    mind: 5,
    fuel: 6,
    training: 4,
    color: "#FBBF24",
  },
] as const

const subscribeToNothing = () => () => {}

function Reveal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  // Keep narrative content in the document's visible state. Framer's reduced-
  // motion preference is resolved after hydration, so an opacity-zero initial
  // state can otherwise strand whole sections offscreen for those visitors.
  return <div className={className}>{children}</div>
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brand}>
      <span className={styles.brandMark}>
        <Image src={logo} alt="" width={compact ? 26 : 32} height={compact ? 26 : 32} priority />
      </span>
      <span>{appName}</span>
    </span>
  )
}

function ProofRow({
  icon,
  label,
  filled,
  total,
  color,
}: {
  icon: ReactNode
  label: string
  filled: number
  total: number
  color: string
}) {
  return (
    <div className={styles.proofRow}>
      <span className={styles.proofLabel}>
        <span style={{ color }}>{icon}</span>
        {label}
      </span>
      <span className={styles.proofDots} aria-label={label + ": " + filled + " of " + total}>
        {Array.from({ length: total }).map((_, index) => (
          <span
            key={index}
            className={styles.proofDot}
            style={index < filled ? { background: color, borderColor: color } : undefined}
          />
        ))}
      </span>
      <strong>{filled}/{total}</strong>
    </div>
  )
}

function HeroWorld() {
  const reduced = useReducedMotion()
  return (
    <div className={styles.heroWorld} aria-label="A visual week in Become">
      <div className={styles.worldGlow} />
      <svg className={styles.heroLine} viewBox="0 0 660 650" aria-hidden="true">
        <defs>
          <linearGradient id="hero-path" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#A78BFA" />
            <stop offset=".48" stopColor="#4ADE80" />
            <stop offset="1" stopColor="#FBBF24" />
          </linearGradient>
        </defs>
        <motion.path
          d="M18 544 C 120 565, 150 474, 236 488 S 366 390, 438 418 S 527 286, 646 303"
          fill="none"
          stroke="url(#hero-path)"
          strokeWidth="4"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: reduced ? 0 : 1.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        />
        {[{ x: 41, y: 545, c: "#A78BFA" }, { x: 234, y: 488, c: "#4ADE80" }, { x: 438, y: 418, c: "#FBBF24" }, { x: 632, y: 304, c: "#A78BFA" }].map((node, index) => (
          <motion.circle
            key={node.x}
            cx={node.x}
            cy={node.y}
            r={index === 2 ? 9 : 6}
            fill={node.c}
            stroke="#07060D"
            strokeWidth="4"
            initial={false}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8 + index * 0.16, type: "spring", stiffness: 260, damping: 18 }}
          />
        ))}
      </svg>

      <motion.div
        className={styles.echoCard}
        initial={false}
        animate={{ opacity: 0.58, x: 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        <span>Week 07</span>
        <strong>You came back.</strong>
        <small>That counts.</small>
      </motion.div>

      <motion.article
        className={styles.heroWeekCard}
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0, rotate: -1.5 }}
        transition={{ duration: 0.9, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className={styles.weekHeader}>
          <div>
            <span className={styles.weekEyebrow}>This week · day 5 of 7</span>
            <strong>Feb 16–22</strong>
          </div>
          <span className={styles.liveBadge}><span />live</span>
        </header>
        <h2>Three promises are moving together.</h2>
        <p>Not a perfect week. A week you can read—and still change.</p>
        <div className={styles.proofPanel}>
          <ProofRow icon={<Brain size={15} />} label="Mind" filled={5} total={7} color="#A78BFA" />
          <ProofRow icon={<Utensils size={15} />} label="Fuel" filled={4} total={7} color="#F87171" />
          <ProofRow icon={<Dumbbell size={15} />} label="Training" filled={3} total={4} color="#4ADE80" />
        </div>
        <blockquote>“I do the work that makes tomorrow easier.”</blockquote>
        <div className={styles.weekFooter}>
          <span>Becoming: consistent</span>
          <span>Details <ChevronRight size={16} /></span>
        </div>
      </motion.article>

      <motion.div
        className={styles.horizonCard}
        initial={false}
        animate={{ opacity: 0.8, x: 0 }}
        transition={{ duration: 0.8, delay: 1.1 }}
      >
        <Sparkles size={16} />
        <span>Horizon</span>
        <strong>The next week is still unwritten.</strong>
      </motion.div>
    </div>
  )
}

function SystemStage() {
  const [activeId, setActiveId] = useState<(typeof SYSTEMS)[number]["id"]>("mind")
  const reduced = useReducedMotion()
  const active = SYSTEMS.find((system) => system.id === activeId) || SYSTEMS[0]
  const systemStyle = { "--system-accent": active.color } as CSSProperties

  return (
    <section className={styles.systemSection} id="system">
      <div className={styles.sectionShell}>
        <Reveal className={styles.sectionIntro}>
          <span className={styles.darkEyebrow}>One person. Three practices.</span>
          <h2>Your body does not live in separate apps.</h2>
          <p>Training changes appetite. Fuel changes performance. Your mind decides whether either one survives a hard day. Become keeps the whole loop together.</p>
        </Reveal>

        <div className={styles.systemGrid} style={systemStyle}>
          <div className={styles.systemTabs} role="tablist" aria-label="Explore the three Become practices">
            {SYSTEMS.map((system) => {
              const selected = system.id === active.id
              return (
                <button
                  key={system.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="system-panel"
                  className={selected ? styles.systemTabActive : styles.systemTab}
                  onClick={() => setActiveId(system.id)}
                  style={{ "--tab-accent": system.color } as CSSProperties}
                >
                  <span className={styles.systemNumber}>{system.number}</span>
                  <span className={styles.systemTabLabel}>
                    <system.Icon size={19} />
                    {system.label}
                  </span>
                  <ArrowRight size={18} />
                </button>
              )
            })}

            <div className={styles.systemCopy} id="system-panel" role="tabpanel">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.id}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className={styles.systemKicker}>{active.label}</span>
                  <h3>{active.title}</h3>
                  <p>{active.body}</p>
                  <ul>
                    {active.details.map((detail) => (
                      <li key={detail}><Check size={15} />{detail}</li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className={styles.productVisual}>
            <div className={styles.productOrbit} />
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                className={styles.phone}
                initial={false}
                animate={{ opacity: 1, x: 0, rotate: -1.4, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, x: -20, rotate: -2, scale: 0.98 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className={styles.phoneSpeaker} />
                <div className={styles.phoneScreen}>
                  <Image
                    src={active.image}
                    alt={active.alt}
                    fill
                    loading="eager"
                    sizes="(max-width: 800px) 72vw, 320px"
                  />
                </div>
              </motion.div>
            </AnimatePresence>
            <div className={styles.productCaption}>
              <span style={{ background: active.color }} />
              The real product, not a moodboard
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function BecomingArc() {
  const [activeWeek, setActiveWeek] = useState(2)
  const reduced = useReducedMotion()
  const week = WEEKS[activeWeek]

  return (
    <section className={styles.becomingSection} id="becoming">
      <div className={styles.sectionShell}>
        <div className={styles.becomingIntro}>
          <Reveal>
            <span className={styles.lightEyebrow}>The Becoming</span>
            <h2>Your weeks become evidence.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p>Every Sunday, Become writes the week back to you: what held, what slipped, what got stronger, and what the next week is asking for.</p>
          </Reveal>
        </div>

        <div className={styles.arcGrid}>
          <div className={styles.arcStage}>
            <svg className={styles.arcLine} viewBox="0 0 720 270" aria-hidden="true">
              <motion.path
                d="M42 218 C 154 224, 188 168, 286 180 S 430 94, 520 119 S 621 62, 692 48"
                fill="none"
                stroke="rgba(255,255,255,.14)"
                strokeWidth="3"
                strokeLinecap="round"
                initial={false}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: reduced ? 0 : 1.35, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
            <div className={styles.arcNodes}>
              {WEEKS.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  className={index === activeWeek ? styles.arcNodeActive : styles.arcNode}
                  onClick={() => setActiveWeek(index)}
                  aria-label={"Open " + item.label}
                  aria-pressed={index === activeWeek}
                  style={{ "--node-color": item.color } as CSSProperties}
                >
                  <span />
                  <small>{item.label}</small>
                </button>
              ))}
              <div className={styles.arcHorizon}>
                <span />
                <small>Horizon</small>
              </div>
            </div>
            <div className={styles.arcSummary}>
              <strong>12 weeks</strong>
              <span>· 36 workouts · 48 mind sessions · a line you can see</span>
            </div>
          </div>

          <div className={styles.arcCardWrap}>
            <AnimatePresence mode="wait">
              <motion.article
                key={week.label}
                className={styles.arcCard}
                style={{ "--week-color": week.color } as CSSProperties}
                initial={false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, y: -14, scale: 0.98 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                <header>
                  <span>{week.label}</span>
                  <strong>{week.dates}</strong>
                </header>
                <h3>{week.headline}</h3>
                <p>{week.note}</p>
                <div className={styles.arcProof}>
                  <ProofRow icon={<Brain size={15} />} label="Mind" filled={week.mind} total={7} color="#A78BFA" />
                  <ProofRow icon={<Utensils size={15} />} label="Fuel" filled={week.fuel} total={7} color="#F87171" />
                  <ProofRow icon={<Dumbbell size={15} />} label="Training" filled={week.training} total={4} color="#4ADE80" />
                </div>
                <blockquote>“{week.identity}”</blockquote>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function BecomeLanding() {
  const isLoggedIn = useSyncExternalStore(
    subscribeToNothing,
    () => Boolean(localStorage.getItem("token")),
    () => false,
  )

  return (
    <main className={styles.root}>
      <nav className={styles.nav} aria-label="Main navigation">
        <div className={styles.navShell}>
          <Link href="/" aria-label={appName + " home"}><BrandMark /></Link>
          <div className={styles.navLinks}>
            <a href="#system">The system</a>
            <a href="#becoming">The Becoming</a>
          </div>
          <div className={styles.navActions}>
            <Link className={styles.signIn} href={isLoggedIn ? "/dashboard" : "/login"}>
              {isLoggedIn ? "Open app" : "Sign in"}
            </Link>
            <Link className={styles.navCta} href="/register">
              Begin <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroNoise} />
        <div className={styles.heroShell}>
          <div className={styles.heroCopy}>
            <motion.div
              className={styles.heroEyebrow}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <span style={{ background: "#A78BFA" }} />
              Mind
              <span style={{ background: "#F87171" }} />
              Fuel
              <span style={{ background: "#4ADE80" }} />
              Training
            </motion.div>
            <motion.h1
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              Who are you
              <em>becoming?</em>
            </motion.h1>
            <motion.p
              className={styles.heroLead}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.2 }}
            >
              Become turns the work no one sees—one workout, one meal, one honest check-in—into a path you can actually follow.
            </motion.p>
            <motion.div
              className={styles.heroActions}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Link className={styles.primaryCta} href="/register">
                Start your line <ArrowRight size={18} />
              </Link>
              <a className={styles.secondaryCta} href="#system">
                See the whole system
              </a>
            </motion.div>
            <motion.div
              className={styles.heroFootnote}
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <Flame size={16} />
              Built for the week you are really having.
            </motion.div>
          </div>
          <HeroWorld />
        </div>
      </section>

      <section className={styles.manifesto}>
        <div className={styles.manifestoLine} aria-hidden="true">
          <span className={styles.lineNodeViolet} />
          <span className={styles.lineNodeRed} />
          <span className={styles.lineNodeGreen} />
          <span className={styles.lineNodeGold} />
        </div>
        <Reveal className={styles.manifestoInner}>
          <span>Most apps tell you what you did.</span>
          <h2>Become shows you what it is making of you.</h2>
          <p>Then <ArrowRight size={15} /> now <ArrowRight size={15} /> next, across all three.</p>
        </Reveal>
      </section>

      <SystemStage />
      <BecomingArc />

      <section className={styles.closing}>
        <div className={styles.closingGlow} />
        <Reveal className={styles.closingInner}>
          <BrandMark compact />
          <h2>Start with today.<br /><em>Let the line prove the rest.</em></h2>
          <p>No heroic reset. No perfect Monday. Just the next honest action, held in context.</p>
          <div className={styles.closingActions}>
            <Link className={styles.primaryCta} href="/register">
              Begin becoming <ArrowRight size={18} />
            </Link>
            <Link className={styles.closingSignIn} href={isLoggedIn ? "/dashboard" : "/login"}>
              {isLoggedIn ? "Return to your week" : "Already a member? Sign in"}
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className={styles.footer}>
        <BrandMark compact />
        <p>Mind · Fuel · Training · one becoming.</p>
        <div>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Register</Link>
        </div>
      </footer>
    </main>
  )
}
