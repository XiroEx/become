# Choosing the Analytics Tool

Read this only after framework 2. Most of what Become needs to know this quarter is a Mongo query
away, and a tool installed before the questions are written produces dashboards nobody reads.

**The final pick is George's call.** This file narrows the field and states the tradeoff; it does
not decide.

---

## The three criteria, in priority order

**1. No health data leaves the app.** Become stores weight, mood, meals, and workout history. That
is health data by any reasonable reading, and by the letter of Google Analytics' own terms it is
data they do not want either. Any tool under consideration has to be usable with `user_id` and
nothing else: no email, no weight, no mood value, no meal contents, no goal, no body metric, ever,
in a property, a URL, or a page title. A tool that makes it easy to leak one of those by accident
is disqualified regardless of its feature list.

This is a constraint on us, not just on the vendor. `/dashboard/progress` and `/dashboard/mind`
have no identifiers in the path today, and any future route that puts one there breaks the rule at
the point of the pageview.

**2. Privacy-light by default.** Cookieless, no cross-site identity graph, no ad-network
integration. Three reasons, in the order they matter: it is the honest thing to do with this data;
it avoids a consent banner, which is a conversion tax on a landing page we are already trying to
tighten; and it keeps us off the ad-blocker lists that eat 20-40% of a fitness audience's
pageviews.

**3. PWA-friendly.** Become installs to the home screen and runs standalone, which breaks three
assumptions most analytics tools make:

- Referrer is empty on a standalone launch. Every install-and-return session looks like direct
  traffic unless the install is tagged at install time.
- The service worker caches page shells, so a naive pageview hook can fire on a cache hit, or not
  fire on a client-side route change. Next.js App Router navigations are not document loads.
- Sessions span a tab handoff: the magic link opens in the mail app's browser, and the original
  tab picks the JWT up by polling. One person, two clients, and a signup that is easy to attribute
  to the wrong source.

Anything that cannot be told about a route change explicitly, or that resolves identity from
cookies alone, will misreport all three.

---

## Secondary criteria

| Criterion | Why it matters here |
|---|---|
| Server-side event support | `account_created` and `workout_logged` must be trustworthy; a client-side-only tool undercounts by whatever the blocker rate is |
| Cost at low volume | We have no revenue. A tool with a seat price or a 10k-event floor is a bad trade for a pre-revenue product |
| Export | If we cannot get raw events out, the tool owns our history and switching costs grow every month |
| Self-hostable | We already run a fleet. Hosting one small service is cheap for us and expensive for most teams, so it is an advantage we should actually use |
| Time to first number | Anything needing a week of setup competes with a Mongo query that answers the same question this afternoon |

---

## The two real options

### A. A Plausible-class self-hostable tool

Plausible, Umami, or Matomo, run on our own box. Cookieless and privacy-light out of the box,
lightweight script, no consent banner, and custom events with properties.

**For:** hours to stand up, a real UI for the traffic questions (which page, which source, which
campaign), and no data leaves infrastructure we control. Handles the acquisition half of the
funnel — the half Mongo cannot answer, because Mongo never sees a visitor who did not sign up.

**Against:** another service to keep alive and back up. Product-side funnels are weak compared to
what a Mongo aggregation already gives us, so this is an addition to framework 2, never a
replacement for it.

### B. First-party `/api/track` writing to our own Mongo

A route in the app that accepts an event name, a `user_id`, and a small typed property bag, and
writes to an `Event` collection alongside the data we already own.

**For:** nothing to block, nothing to leave, nothing to pay for, one database to join across. A
funnel that starts at a pageview and ends at a logged workout becomes one aggregation instead of a
reconciliation between two systems. It also fits the shape the codebase already has: a route
handler, a Mongoose model, and the `track()` wrapper framework 4 specifies.

**Against:** we build and maintain it, including the parts nobody enjoys — bot filtering, session
stitching, retention of raw rows, and a UI. Expect the UI to be a saved aggregation and a chart,
not a product. Underestimating this is the standard way this option fails.

---

## Default recommendation

**Both, in this order.** They answer different questions and the split is clean:

1. **First-party `/api/track` into our own Mongo** for anything about a known user: activation,
   the funnel from `account_created` onward, retention, feature adoption. It joins to the data we
   already have, it cannot be blocked, and it keeps health-adjacent context in one place.
2. **A Plausible-class self-hosted tool** for anonymous acquisition: landing sessions, referrers,
   UTM campaigns, the top of the funnel before an account exists.

The seam sits at `account_created`. Above it, anonymous and aggregate. Below it, first-party and
joined. Write the seam down in the spec, because every "our numbers do not match" argument for the
next year will be about which side of it a number came from.

**Do not use Google Analytics for this product.** Health-adjacent data, a consent banner on the
page we are trying to convert, and the highest blocker rate of any option.

---

## What to hand back

State the recommendation, the tradeoff in one paragraph, and this line verbatim:

> Final tool selection is George's call. This is a recommendation, not a decision, and nothing in
> the instrumentation tasks below depends on which option is chosen — the event names, properties,
> and the `track()` wrapper are identical either way.

That last clause is the point. Framework 4's event table is the durable artifact. The tool is
swappable; the naming scheme is not.
