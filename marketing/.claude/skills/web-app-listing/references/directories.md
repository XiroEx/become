# Directory Tiers

Surfaces a free PWA can actually list on, ranked by realistic value. "Value" here means referral
traffic plus durable indexable pages that search and AI answer engines can cite, because a citation
outlives a traffic spike.

**Always fetch the live submission page before writing.** Field names and limits change, and a
listing written to a remembered spec gets rejected or truncated. Every note below is a starting
point, not a substitute for reading the form.

---

## Tier 1: worth real preparation

### Product Hunt

- **What it is.** A launch-day feed plus a permanent product page.
- **Why tier 1.** The permanent page ranks and gets cited. The launch day itself is secondary.
- **Fields.** Name, tagline (short, and it must work without the name), description, topics, gallery,
  first comment from the maker, links.
- **Gotchas.** One launch per product, so preparation matters more than speed. The maker comment
  carries most of the weight and should be Jon in first person (`coach-brand-voice`). Do not launch
  the same day something else in the category does. Do not ask for upvotes in a way that violates
  their rules.
- **PWA fit.** Fine. Web link only, no store link required.
- **Coordinate with.** `launch-campaign` for the run of show. This skill only produces the kit.

### AlternativeTo

- **What it is.** A comparison database. People arrive searching "alternative to MyFitnessPal."
- **Why tier 1.** Highest-intent traffic of any directory available to us, and the pages are heavily
  cited by AI answers to comparison questions.
- **Fields.** Name, short description, longer description, categories, platforms, licence, features,
  screenshots, and the alternatives it competes with.
- **Gotchas.** Licence field: choose Free. Never Freemium, which implies a paid tier we do not have.
  Platform: Web and PWA, not iOS or Android. Listing yourself as an alternative to a product you are
  not genuinely comparable to gets the entry flagged.
- **PWA fit.** Good. Web is a first-class platform there.
- **Which alternatives to claim.** Only ones where the comparison is honest. `competitor-analysis`
  owns which those are; do not assert a comparison this skill has not verified.

---

## Tier 2: low traffic, durable value

### PWA and web-app directories

Examples of the category: PWA-specific indexes, "web apps that replace native apps" lists, and
progressive-web-app showcases.

- **Why tier 2.** Small audiences, but the pages are permanent, indexable, and specifically about
  being a PWA, which is a differentiator we can state plainly.
- **Fields.** Usually name, URL, one-liner, category, a screenshot or two.
- **Gotchas.** Many require a valid manifest and a service worker, both of which Become has. Some
  read the manifest directly, which makes
  `webapp/app/manifest.json/route.ts` a listing surface in its own right. The empty `screenshots`
  array there is a real gap.
- **PWA fit.** Perfect. This is the one category built for us.

### BetaList and early-stage indexes

- **Why tier 2.** A durable page and a small burst of interested early adopters.
- **Fields.** Name, tagline, extended description (around 260 characters is typical), a single image,
  a category.
- **Gotchas.** Some are positioned for pre-launch products, so check whether a live product is
  eligible. Some charge for expedited review. Paying to skip a queue is a spend decision, not a copy
  decision, and belongs in `marketing-plan`.

### Fitness-tool roundups and blog lists

- **Why tier 2.** "Best free fitness apps" roundups are exactly the query tier we want to be cited
  in, and inclusion is often a matter of asking the author.
- **Approach.** Pitch the author with the standard 160-character blurb, one differentiating mechanic,
  and a link. Offer the gallery. Never offer money and never offer a fabricated stat.
- **Gotchas.** Many roundups list price. "Free" is the honest answer and it is also a competitive
  advantage in that table. Never let the author write "free trial" or "freemium"; correct it.

### AI-answer surfaces

Assistants cite directory entries, roundups, and comparison pages far more readily than they cite a
marketing homepage. Treat every tier 1 and 2 listing as an input to that. Write sentences that stay
true when quoted out of context, with no pronouns depending on nearby text. `seo-geo` owns the
strategy, including `llms.txt` and structured data, both of which are missing from the repo today.

---

## Tier 3: high intent, high risk

### Reddit and forums

- **Why it can work.** A relevant thread reaches people at the exact moment of the problem.
- **Why it is risky.** Most fitness, PWA, and app subreddits ban self-promotion outright or gate it
  behind participation history. Breaking the rule costs the account and the goodwill, not just the
  post.
- **Rules, in order.**
  1. Read the sidebar, then the pinned rules, then recent removals.
  2. If self-promotion is banned, do not post. There is no clever workaround.
  3. If a weekly promo thread exists, use only that thread.
  4. Disclose the affiliation in the first line, plainly. "I built this" is the whole disclosure.
  5. Answer the question asked. A comment that solves the poster's problem and mentions Become once
     is welcome. A comment that pitches is spam.
- **Never.** Sock puppets, fake "has anyone tried this" posts, upvote rings, or a fabricated user
  story. Every one of these violates the no-fabrication rule as well as the platform's.

### Discord and community servers

Same rules. Contribute first, disclose plainly, link once, and only where it is on topic.

---

## Tier 4: skip

- Aggregators that scrape and republish without an indexable page.
- Paid "get listed on 100 directories" packages. Low quality links, no traffic, occasional harm.
- Surfaces that require an App Store or Play Store link. We do not have one and will not fake one.
- Any surface that requires a rating, a review count, or a download number to complete the listing.
- Any surface requiring a real user account for review. A dummy account from the capture pipeline is
  the only acceptable answer, and only when the surface genuinely requires it.

---

## Fields that need a Become-specific answer

Come to every form with these ready.

| Field | Our answer | Never |
|---|---|---|
| Platform | Web, PWA. Installable on iOS and Android from the browser. | iOS app, Android app |
| Pricing | Free | Freemium, Free trial, a number, "free for now" |
| Category | Fitness, Health, Lifestyle (matches the manifest's `categories`) | Wellness, Medical |
| Rating | leave blank | any number |
| Downloads or users | leave blank | any number |
| Version | leave blank, or the date of the last release if required | an invented semver |
| Store links | leave blank, with a note that it is a PWA | a placeholder URL |
| Demo account | only if required, and only a dummy account | a real user, a credential written down anywhere |
| Founder | Jon Don, Founder and Head Coach | a personal photo from a camera roll |
| Website | `become.redbtn.io` | any beta URL |

---

## Submission cadence

One surface at a time, with roughly a week between, so a change in signups is attributable. Batching
ten submissions in a day produces one unreadable bump and no learning.

Order to work through: Product Hunt preparation runs longest, so start it first but submit it last.
AlternativeTo and the PWA directories can go immediately because they are evergreen. Roundup pitches
go out continuously.

Every submission gets a row in the tracker: surface, date, who submitted, link to the live listing,
UTM used, and the referral traffic after 30 days. UTM grammar belongs to `analytics-tracking`. A
listing with no UTM produces no learning, and re-editing a live listing later is often impossible.
