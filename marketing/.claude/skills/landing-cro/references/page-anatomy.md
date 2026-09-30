# Landing Page Anatomy

The real structure of `become.redbtn.io`, as built. Read this before auditing so findings land on the
right component. Verify against the source, because the page changes:
`webapp/components/landing/BecomeLanding.tsx`.

## File map

| File | What it holds |
|---|---|
| `webapp/components/landing/BecomeLanding.tsx` | The whole page. All sections are local components in this one file. |
| `webapp/components/landing/HeroLine.tsx` | The animated line that starts the vertical motif in the hero stage. |
| `webapp/components/landing/Spine.tsx` | The gutter spine and its dots. Threads the sections together. |
| `webapp/components/landing/Phone.tsx` | Device frame around a capture. Takes `src`, `srcDark`, `tone`, `island`, `sizes`, `priority`. |
| `webapp/components/landing/Marquee.tsx` | The scrolling strip. |
| `webapp/components/landing/hooks.ts` | `useReducedMotionSafe`, used by every animated piece. |
| `webapp/components/landing/landing.module.css` | All layout, spacing, and theme tokens for the page. |
| `webapp/app/page.tsx` | The route that renders it. |

## Section spine, in render order

| # | Component | Anchor | Job | Primary asset |
|---|---|---|---|---|
| 1 | `Nav` | none | Brand mark, links, sign-in state | none |
| 2 | `Hero` | none | Frame, one mechanic, primary CTA, risk reversal | `dashboard-light` + `dashboard-dark`, `workout-log-dark`, `HeroLine`, `HeroChips` |
| 3 | `WhySection` | `#why` | The reframe: scattered tools, not scattered discipline | icon cards, no capture |
| 4 | `DashboardSection` | `#dashboard` | Day at a glance | `dashboard-*` |
| 5 | `TrainingSection` | `#training` | Programs, generate, logging. Tabbed. | `workout-hub-*`, `generate-*`, `workout-log-dark` |
| 6 | `NutritionSection` | `#nutrition` | Photo logging, targets | `nutrition-day-*`, `nutrition-meal-*` |
| 7 | `MindSection` | `#mind` | Sessions, mood | `mind-*` |
| 8 | `ProgressSection` | `#progress` | Trends, recap, `StatCounter` | `progress-*` |
| 9 | `StepsSection` | `#how` | "Three steps to day one" | numbered rail, no capture |
| 10 | `CoachSection` | `#coach` | Jon quote card, credentials strip | `/profile.jpg` |
| 11 | `ClosingSection` | none | Final ask, sign-in for members | brand mark |
| 12 | Footer | none | Links | none |

Supporting local components in the same file: `BrandMark`, `Reveal`, `SectionHeading`, `FeatureList`,
`SpineDot`, `HeroChips`, `StatCounter`.

## Conversion actions on the page

| Location | Label | Destination | Notes |
|---|---|---|---|
| `Nav` | varies with sign-in state | `/register` or `/dashboard` | Reads a client-side logged-in signal |
| `Hero` primary | "Get started" | `/register` | The main ask |
| `Hero` secondary | "See what's inside" | `#why` | Anchor scroll, not a conversion |
| `ClosingSection` primary | "Start today" | `/register` | The second and last ask |
| `ClosingSection` secondary | "Already a member? Sign in" / "Open the app" | `/login` or `/dashboard` | Member path |

**There is no email field on the landing page.** Both asks are navigations to `/register`, where
`AuthForm` collects name and email. That extra page load is the single most testable friction point
on the page.

## Motion inventory

| Element | Behaviour | Cost |
|---|---|---|
| `rise()` in `Hero` | Staggered fade and translate, delays 0 to 0.42s | Hero text and CTA are not at final position for roughly half a second |
| `float()` on hero phones | Infinite 6.5s and 7.6s bob with rotation | Continuous compositor work |
| `HeroChips` | Five chips on a 21s infinite loop, staggered 7s apart | Runs for the whole session |
| `HeroLine` | Animated line draw | One-shot |
| `Reveal` | Per-section `whileInView` with `once: true` | One observer per revealed block |
| `SpineDot` / `closingElbow` | Clip-path reveals on scroll | One-shot, but the closing elbow has a documented clip-path gotcha |
| `StatCounter` | Counts up on view | One-shot |
| `Marquee` | Continuous scroll | Continuous |

Every one of these checks `useReducedMotionSafe` and collapses to a static state. Any new motion
must do the same. That is a hard requirement, not a nicety.

## The 390x844 budget

Measure the first screen against this, in order down the page:

1. `Nav` height plus safe-area inset top.
2. Hero eyebrow (one line).
3. Hero H1 (three rendered spans, so three lines at mobile type size).
4. Hero lead (four to five lines at 390px).
5. Hero actions row (primary and secondary side by side, or stacked).
6. Hero footnote (one to two lines).
7. Hero stage: two tilted phones plus glow.

Items 1 to 6 must fit inside 844px minus the browser chrome, or the CTA is below the fold. On a real
iOS Safari with the URL bar expanded, the usable height is closer to 750px. Audit against that.

## Theme behaviour

`webapp/app/layout.tsx` runs an inline script that toggles a `dark` or `light` class on
`documentElement` from `prefers-color-scheme`, before paint, and re-toggles on change. There is no
manual theme switch on the landing page. Consequences for an audit:

- Every visual finding needs a verdict for both themes.
- `Phone` takes both `src` and `srcDark`; a section using a shot with no light twin
  (`workout-log-dark.webp`) is pinned dark by design. The hero does this deliberately with
  `tone="dark"` and `island={false}`.
- `themeColor` is set per scheme in the viewport export (`#fafafa` light, `#18181b` dark).

## Capture usage

The page pulls from `webapp/public/screenshots/v2/` through a `shot()` helper. Before proposing a new
image, check `webapp/public/screenshots/v2/manifest.json` for what is already captured and what state
it shows. Reuse beats recapture. Notable constraints recorded there:

- `workout-log` is dark only.
- Weight and mood history cannot be backdated through any app API, so trend charts are single-point.
- The generate sheet was captured filled but not submitted.
- Streak on the dashboard shot reads 1 day, because the account's activity was seeded that day.

Copy in a section must not imply more than its capture shows.

## Related routes the page hands off to

| Route | File | Role |
|---|---|---|
| `/register` | `webapp/app/register/page.tsx` | Renders `AuthForm` in register mode |
| `/login` | `webapp/app/login/page.tsx` | Renders `AuthForm` in login mode |
| `/verify` | `webapp/app/verify/page.tsx` | Consumes the magic-link token, handles the tab handoff |
| `/onboarding` | `webapp/app/onboarding/page.tsx` | Five steps: Goals, Background, Body & nutrition, Equipment, Review |
| `/information` | `webapp/app/information/page.tsx` | Public info page |
| `/share/[shareId]` | `webapp/app/share/[shareId]/page.tsx` | Public share view, a real second entry surface |

Everything from `/register` onward belongs to `signup-activation`. The landing audit stops at the
click, except for one thing: the page should set an honest expectation of what the next screens cost.

`/share/[shareId]` deserves its own audit pass. It is an entry surface for people arriving from a
member's share, and it should not behave like a cold homepage.
