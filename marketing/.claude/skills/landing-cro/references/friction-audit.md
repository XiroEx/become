# Friction Audit

A checklist run, in order, against a Become entry surface. Score each item pass, fail, or unknown.
Unknown counts as fail until someone checks on a device.

## A. The five-second test

Show the first screen for five seconds, then hide it and ask three questions.

1. What does this do?
2. Who is it for?
3. What happens if you tap the button?

A pass is all three answered without hedging. If question 1 comes back as a category ("a fitness
app") rather than a mechanic ("a coach's programs plus food logging by photo"), the hero is the
finding and nothing below it matters yet.

## B. Above the fold, 390x844

| # | Check | Fail looks like |
|---|---|---|
| B1 | Primary CTA visible without scrolling | CTA at 900px because the hero stage is tall |
| B2 | CTA visible with iOS Safari chrome expanded (about 750px usable) | Passes in a desktop devtools emulation, fails on a real phone |
| B3 | Headline legible at final position within 300ms | Staggered entrance still animating at first paint |
| B4 | Product image present in the first screen or immediately after | An abstract gradient carries the fold |
| B5 | Tap target at least 44x44 and inside the thumb zone | A text link acting as the primary action |
| B6 | Safe-area inset respected at the bottom on a sticky element | CTA under the iOS home indicator |
| B7 | Both themes pass B1 to B6 | Only checked in dark |

## C. The ask

| # | Check | Fail looks like |
|---|---|---|
| C1 | One primary action, visually dominant | Primary and secondary at equal weight |
| C2 | The ask repeats at least once mid-page | Hero and closing only, nine sections apart |
| C3 | CTA label names the payoff | "Submit," "Continue," "Learn more" |
| C4 | Label matches the promise in the block above it | A generic label under a specific claim |
| C5 | Steps from landing to entered email counted and minimized | A page navigation before the first field |
| C6 | Member path present but quiet | Sign-in competing with signup |

## D. Objections, answered inline

Each row is an objection that forms at a specific scroll position. The page either answers it there
or loses the visitor there.

| Objection | Forms at | Honest answer to place there |
|---|---|---|
| "Another fitness app." | Hero, first second | The reframe: your plan is in four apps, not that you lack discipline |
| "Does the photo thing actually work?" | Hero or Nutrition | Show the itemized result, not an adjective |
| "Is this real coaching or an AI toy?" | Training | "A coach built the phases. The AI fills the gaps." |
| "I hate logging food." | Nutrition | "One photo. The whole plate, itemized." |
| "How much is it?" | Anywhere | "Nothing is gated today. No credit card." Never a future price. |
| "So what is the catch?" | After the free line | Name what we get: nothing, today. Do not fabricate a business model. |
| "I do not want another password." | At the CTA | "There is no password. We email you a link." |
| "I do not want to wait for an email." | At the CTA | "Or use Google, or a passkey. Both are on the form and neither touches your inbox." |
| "Will the email arrive?" | At the CTA | "It arrives in under a minute. Check spam if it does not." |
| "What if I close the tab?" | At the CTA | "Open the link on any device. It signs you in there." |
| "How long is setup?" | At the CTA | "Five questions, then your first session." |
| "Is it on the App Store?" | Anywhere | "It runs in your browser. Add it to your home screen." |
| "Will it work on my phone?" | Anywhere | It is a PWA, so say browser, not platform |

Objections we cannot answer and must not fake: how many people use it, whether it worked for anyone
else, what results to expect, how much it will cost later.

## E. Proof placement

| # | Check | Fail looks like |
|---|---|---|
| E1 | Every claim has proof within one screen of it | All proof in the coach card, ninth |
| E2 | Proof is a capture, a coach fact, or a demonstrated mechanic | Adjectives doing the work |
| E3 | Captures are current and from the v2 set | A legacy `ss-*.png` still in place |
| E4 | No fabricated proof anywhere | A counter, a rating, a testimonial, a "trusted by" strip |
| E5 | Coach credibility appears before the halfway scroll | Only in the quote card at the bottom |
| E6 | Capture state matches the copy next to it | "Months of progress" beside a single-point chart |

## F. Copy quality on the page

| # | Check | Fail looks like |
|---|---|---|
| F1 | No banned words | "journey," "seamless," "effortless," "just," "simply" |
| F2 | Near-zero em dashes | The current hero lead uses one; a comma does the same work |
| F3 | Second person, present tense, active | "Users can track their workouts" |
| F4 | One idea per block | A section header carrying three claims |
| F5 | Concrete noun in the first four words of every heading | "Everything you need to succeed" |
| F6 | No pricing, count, testimonial, timeline, or result claim | Any of them, anywhere |

Anything failing F1 to F6 goes to `copy-editing` with the specific line. Anything needing a
replacement written from scratch goes to `copywriting`.

## G. Speed and motion

| # | Check | How to check |
|---|---|---|
| G1 | LCP on the hero under 2.5s on a mid-tier phone on 4G | Lighthouse against the production URL |
| G2 | Captures served through `next/image` with an accurate `sizes` | Read the `Phone` usages in `BecomeLanding.tsx` |
| G3 | No image served larger than it renders | v2 shots are 780x1688 |
| G4 | Infinite animations limited above the fold | `HeroChips` at 21s and `Marquee` both run continuously |
| G5 | `prefers-reduced-motion` collapses everything to static | Every animated block uses `useReducedMotionSafe` |
| G6 | Client JS not blocking the first meaningful paint | The page is a client tree with Framer Motion |

Measure before recommending. An opinion about animation cost that a Lighthouse run contradicts is a
wasted finding.

## H. Cross-surface consistency

| # | Check | Fail looks like |
|---|---|---|
| H1 | The ad or Reel hook and the hero make the same promise | A photo-logging ad landing on a generic hero |
| H2 | `/register` continues the language of the CTA that sent them | "Start today" leading to a bare "Create account" |
| H3 | OG image and description match what the page says | Thin metadata, no OG image at all |
| H4 | `/share/[shareId]` does not behave like a cold homepage | An invited visitor sees the same generic hero |
| H5 | Both channels are consistent | Beta renders "Become (beta)" from `APP_NAME`; never capture or ship that string in marketing |

## Scoring and triage

Count fails by section. Fix in this order: A, B, C, D, E, F, G, H. A single fail in A or B outranks
every fail in F and G combined, because clarity and visibility gate everything downstream.

Write each fail as a finding with: symptom, file, component, proposed change, expected direction,
and what would prove you wrong. Findings without a file do not ship.
