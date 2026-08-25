# Owned, Rented, Borrowed

Sort every launch channel by how much control we hold. Control determines certainty, and
certainty determines sequencing.

---

## Owned — total control, highest conversion, fires first

| Channel | Surface | Reach | Latency | Notes |
|---|---|---|---|---|
| Landing page | `webapp/components/landing/` | Everyone who arrives | Instant | The destination for every other channel. Must mention the feature. |
| Email list | Nodemailer SMTP, `webapp/lib/email.ts` | **Every member** | Minutes | See below. |
| Web push | `webapp/lib/pushNotification.ts` | Members who granted permission | Seconds | One push, and it yields to product nudges. |
| In-app surfaces | Dashboard tiles, the hub the feature lives in | Members who open the app | On next open | Free, high-intent, systematically underused. |

**Email is unusually strong for Become and this matters for launch planning.** Signup is a magic
link, so the email address *is* the identity. Every member reached the product by opening an
inbox and clicking a link inside it. There are no unconfirmed addresses, no typos, no purchased
records. The list is small but it is the highest-quality asset in the plan.

The corollary: the marketing program is a tenant on infrastructure the product depends on. A
guilt-toned launch blast that draws complaints damages the sender that carries the login link.
Ramp the send, keep it honest, suppress anyone who already used the feature. See
`email-lifecycle`.

**Owned expected contribution:** the majority of launch-day activations, and close to all of the
reliable ones. Plan owned first, always.

---

## Rented — partial control, algorithmic, fires second

| Channel | Control we have | Control we lack | Launch role |
|---|---|---|---|
| Become handle (IG, TikTok) | What and when we post | Whether anyone sees it | The announcement of record |
| Jon's handle | What he posts, if he agrees | Distribution, and his willingness | Highest-trust rented surface |
| Product Hunt | Submission, timing, first comment | Ranking, and the audience's mood | A day-shaped event of its own |
| Directories (AlternativeTo, PWA indexes, roundups) | Listing quality | Approval and placement | Slow burn, and increasingly a citation source for AI answers |
| Existing content and search surfaces | What we publish | Whether it is indexed or cited | Compounds after the launch, not during |

**Rules for rented reach:**
- Every rented post links to the same destination with a distinct UTM, so we can tell which one
  actually worked.
- Directory listings outlive the launch. They are the one rented asset that keeps paying, and
  increasingly the surface AI assistants read when someone asks for a recommendation. See
  `web-app-listing` and `seo-geo`.
- A Product Hunt launch is its own day with its own rhythm. Do not staple it onto a feature
  launch already running on another channel.

**Rented expected contribution:** the majority of *new-person* impressions, a minority of
activations. Plan for reach here, not conversions.

---

## Borrowed — no control, the only source of genuinely new people

| Channel | How we get it | How we lose it |
|---|---|---|
| Jon's audience | He posts because he believes it | Asking him to read a script that is not his voice |
| Creators | A brief, rights, and a fair deal | Undisclosed partnerships, or fabricated claims in their words |
| Communities and forums | Genuine participation over weeks | Drive-by launch links from a fresh account |
| Press and newsletters | An angle they can use | Pitching a feature as if it were a company |
| Members sharing | Something worth sharing at a proud moment | Asking on day one, or after a missed day |

**Rules for borrowed reach:**
- **Unsecured borrowed reach is not a channel.** A creator who has not agreed, a subreddit
  nobody has posted in, a journalist nobody has emailed. Take it out of the plan or secure it.
- Borrowed channels speak in their own voice. A creator reading our copy converts worse than a
  creator saying the true thing in their words. Brief the substance, not the script. See
  `ugc-creator-briefs`.
- **Creator claims are our claims.** The constraint list applies to their words: no invented
  results, no pricing, no medical claims, no before/after framing implying a guarantee. FTC
  disclosure is required, including for gifted access.
- Communities: participate for weeks before launching, or do not launch there. Lead with the
  mechanism, not the pitch.

**Borrowed expected contribution:** the highest variance in the plan. Occasionally the whole
launch. Frequently zero. Never build the primary metric on it.

---

## Sequencing on launch day

```
07:00-09:00 local   OWNED     Landing updated · email send begins ramping · in-app surface live
09:00-10:00 local   OWNED     One push, only to members who have not already had a nudge today
10:00 local         RENTED    Become handle post · Jon's handle post · directory submissions go live
All day             BORROWED  Creator posts land on their own schedule · community threads · replies
All day             HUMAN     The named owner replies to every comment and DM
T+1 to T+7          SECOND WAVE  Behind the scenes · how it works · the top launch-day question answered
```

**Why owned first:** it is certain, it converts best, and it produces the earliest real usage.
Real usage on launch morning gives the rented and borrowed posts something true to point at.

**Why one push:** the tray is shared with nine live product nudges
(`webapp/app/api/cron/notify/route.ts`). A launch push consumes that user's daily slot and is
suppressed for anyone who already received a product nudge. The product nudge wins. See
`push-notifications`.

**Why the email suppresses feature-users:** announcing something to a person who already used it
reads as if we do not know them.

---

## Expected contribution, stated up front

Write the split before launch and compare against it at T+7. Guessing wrong is fine; not having
guessed is what makes the review meaningless.

| Tier | Impressions | Activations | Certainty |
|---|---|---|---|
| Owned | Low | High | Near certain |
| Rented | High | Low to moderate | Moderate |
| Borrowed | Highly variable | Variable | Low |

The most common failure of a small-team launch is inverting this: building the plan on borrowed
reach that never materialises, while the email to existing members goes out as an afterthought
at 4pm.

---

## The message differs by tier

One launch, three messages. Do not copy-paste.

| Tier | Audience state | Message shape | Example |
|---|---|---|---|
| Owned | Already uses Become | "This is new in your app" | `The camera counts your reps now. Open LIVE mode on your next set.` |
| Rented | Knows the category, not us | "Here is the mechanism" | `Prop the phone, train, and it logs the set. No wearable, no tapping between sets.` |
| Borrowed | Knows the creator, not us | Their words, our truth | Brief the mechanism and the limits. Let them phrase it. |

```
❌ We're excited to announce a revolutionary new feature that will transform your training!
✅ The camera counts your reps now. Prop the phone, train, and the set is logged.
```
