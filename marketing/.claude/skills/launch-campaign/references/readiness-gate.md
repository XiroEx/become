# The Readiness Gate

Run this before a date is announced to anyone, internally or externally. **Any red item moves
the date.** The gate is the point of this skill: it is much cheaper to slip a launch by a week
than to launch a thing that embarrasses us in a screenshot that then circulates.

Record the verdict as a table with a GREEN / RED per row and a one-line note. Do not summarise
it as "mostly ready."

---

## Section 1 — The thing is real

| # | Check | Red means |
|---|---|---|
| 1.1 | The feature is live on `become.redbtn.io`, not just `become-beta.redbtn.io` | No date exists yet, only a target |
| 1.2 | You personally used it on a phone today | You are launching a description, not a feature |
| 1.3 | It works in **light** and **dark** | Half our members will see the broken half |
| 1.4 | It works at 390x844 with safe-area insets respected | The PWA's actual viewport |
| 1.5 | It works for a **new** account with no history, not only a seeded one | New visitors are the launch audience |
| 1.6 | No "(beta)" label, dev banner, or placeholder copy is visible anywhere in the flow | It ships into every screenshot |
| 1.7 | The obvious failure case degrades gracefully | Launch traffic finds every edge in an hour |

**1.5 deserves emphasis.** A feature that is beautiful with three months of logged data and
empty on day one is not launch-ready for strangers. Fix the empty state or launch it to members
only.

---

## Section 2 — The captures exist and are clean

| # | Check | Red means |
|---|---|---|
| 2.1 | `webapp/public/screenshots/v2/manifest.json` read before commissioning anything new | Wasted capture run |
| 2.2 | At least one capture shows the feature with populated, realistic state | The graphic sells emptiness |
| 2.3 | Light and dark twins exist where the surface will be used in both | Inconsistent creative |
| 2.4 | No bug, no zero row, no locked-card wall, nothing mid-animation | The bug becomes the launch |
| 2.5 | Any capture-time DOM patching is disclosed in the manifest `knownIssues`, and the underlying bug is filed | We are hiding a defect |
| 2.6 | Captures came from a dummy account through the documented pipeline | Real member data in public creative |

New captures go through `screenshot-capture`. Known traps recorded there include: weight and
mood cannot be backdated through any API so trend charts are single-point; the progress Weekly
Volume bar uses a hardcoded dark fill that is invisible on the dark card; exercise demos render as
a black panel in Chromium because `webapp/components/FramedVideo.tsx` emits
`type="video/quicktime"` on the `.mov` sources, so capture on iOS or Safari where they play;
auto-rotating carousels must be clicked back to match the light or dark twin.

---

## Section 3 — The destination is ready

| # | Check | Red means |
|---|---|---|
| 3.1 | The landing page (`webapp/components/landing/`) or an in-app surface mentions the feature | Traffic lands on a page that does not describe what was promised |
| 3.2 | The ad or post hook, the landing first line, and the CTA make the **same** promise | Message mismatch, the classic silent launch killer |
| 3.3 | The signup path from that page works end to end, on a phone, right now | Highest-cost failure possible |
| 3.4 | The magic-link email arrives and the link works | Signup is authentication; a deliverability failure is an outage |
| 3.5 | Any share or invite link involved lands somewhere better than a cold homepage | Wasted borrowed reach |

Test 3.3 and 3.4 with a fresh dummy address on the day, not from memory.

---

## Section 4 — Measurement is live

| # | Check | Red means |
|---|---|---|
| 4.1 | The primary metric is defined and currently readable | You cannot tell if it worked |
| 4.2 | The event that proves feature usage fires | "Feature adoption" is unanswerable |
| 4.3 | UTM convention agreed for every outbound link | All traffic reports as direct |
| 4.4 | The baseline for the primary metric is recorded **before** launch | No comparison is possible after |
| 4.5 | Beta and production traffic can be told apart in the report | Two channels share one database |

Definitions and the UTM grammar live in `analytics-tracking`. 4.4 is the one everyone forgets
and it is the one that makes the T+7 review meaningless.

---

## Section 5 — The humans are ready

| # | Check | Red means |
|---|---|---|
| 5.1 | Someone owns replies on launch day, by name, with hours blocked | The best hour of the campaign is dropped |
| 5.2 | The sceptical FAQ is written: how does the photo logging actually work, what does it get wrong, where does my food photo go, is this really free, is my data sold | Improvised answers on the day, and improvised answers invent things |
| 5.3 | Jon knows the date and what he is posting | The single highest-leverage borrowed channel goes quiet |
| 5.4 | Support has a path for "it did not work for me" | A bad first impression with no recovery |
| 5.5 | Every claim in every asset has been checked against product truth | A fabricated claim on launch day |

**5.2 in detail.** Write the honest answer, including limits. "It estimates portions, so it reads
a chicken breast better than a mixed curry, and you correct anything it missed" outperforms "it's
incredibly accurate." Honesty about limits is the strongest credibility move available to a product
with no user counts to show.

---

## Section 6 — Constraint compliance

Run these against every asset in the manifest, no exceptions.

- [ ] No fabricated testimonials, user counts, or results claims.
- [ ] No pricing, tier, trial length, or discount, invented or implied. Become is free today.
- [ ] No promised timelines or pound counts. No medical claims. No before/after framing.
- [ ] No body-shaming, no hustle or guilt framing.
- [ ] No personal camera-roll photos of the coach.
- [ ] The Becoming appears at most once and is not the headline theme.
- [ ] No "(beta)" anywhere.
- [ ] Any benchmark cited internally carries its tier label and is not restated as a Become claim.
- [ ] Light and dark creative both exist where both are needed.
- [ ] No secrets, tokens, or credentials in any asset or generated file.

---

## The verdict

Write it as one of three, and write it plainly:

- **GREEN — launch on the date.** All sections pass.
- **AMBER — launch to members only.** The feature is real and clean, but the empty-state or
  new-account experience is not ready for strangers. Owned channels only. No directories, no
  borrowed reach.
- **RED — move the date.** Name the specific failing rows and the shortest path to green.

**An AMBER launch is a real launch and often the right one.** Announcing to existing members is
cheap, safe, generates real usage data, and produces the populated captures that make the public
launch better two weeks later.
