# Health & Wearable Gateways — Discovery Round

Card: "Build Apple Health and other health app gateways for easy implementation."
Requested by George: *"Do a discovery round and state plainly what is doable right
now and what needs a native application or approval."* This document is that
discovery round — no gateway code ships with it.

**Note on the attached spec:** the card's attached PDF ("Health & wearable OAuth
providers — implementation spec for the redbtn OAuth2 endpoint") returned a
persistent `502` from `board.redbtn.io` on every retry (6 attempts over several
minutes). Its contents are not reflected below — this report is built from the
comment thread's ask plus independent research and the current state of this
repo. If that PDF specifies an exact provider list, scope names, or a shared
"redbtn OAuth2 endpoint" broker design, re-attach it and this doc should be
reconciled against it before any build work starts.

## TL;DR

| Path | Verdict | Why |
|---|---|---|
| Apple HealthKit (iOS) | **Native app required — already have the shell, not started** | No web/OAuth API exists at all; Become's `expo/` app already has the adapter shape and opt-in UI built (P16), just not wired to a real bridge yet |
| Android Health Connect | **Native app required — already have the shell, not started** | Same adapter, same gap: needs a dev build |
| Oura | **Doable now, self-serve** | OAuth2, no approval queue |
| Whoop | **Doable now, self-serve** | OAuth2, no approval queue (testers need a Whoop device) |
| Strava | **Doable now, self-serve** | OAuth2 Standard Tier is self-service as of June 2026 |
| Samsung Health | **Needs approval** | Gated developer program, manual review |
| Garmin | **Blocked indefinitely** | Developer program is on hold, not accepting new applications, no ETA |
| Fitbit (legacy Web API) | **Do not build against it** | Sunsetting September 2026 |
| Google Health API (Fitbit's replacement) | **Needs approval** | All scopes are "Restricted" — requires a Google privacy/security review before go-live |
| Multi-provider aggregator (Terra / Vital-Junction / Spike) | **Doable now, but recurring cost** | Buys unified OAuth + normalization across 100s of devices instead of building each integration |

## 1. Apple Health — no web path exists, and it never will

Apple does not expose HealthKit data through any server-side or OAuth-style
API. There is no REST endpoint, no OAuth consent screen, no token to store.
HealthKit only runs inside a native iOS app holding the `HealthKit`
entitlement, and data physically stays on-device until that app reads and
uploads it. This is an architectural decision by Apple for privacy, not a
partner-approval gate — there is no application to file or fee to pay that
changes it. A companion native app is the only way to get Apple Health data
into Become, full stop.

**The good news: Become already has that native app**, and health integration
is already scoped inside it:

- `expo/lib/health/{types,adapter,ios,android}.ts` — a `HealthClient`
  interface (`readWeight`, `readSteps`) with iOS and Android adapter shapes
  already written, normalizing HealthKit's/Health Connect's kilograms to the
  pounds the webapp uses.
- `expo/lib/health/opt-in.ts` — a SecureStore-backed opt-in flag, reused from
  the existing token-store plumbing.
- `expo/app/(tabs)/profile/health.tsx` — a shipped-looking Profile screen with
  a "Sync from Health" toggle and copy: *"Become only reads — we never
  write."*
- `expo/__tests__/healthAdapter.test.ts` — adapter-shape tests using injected
  fakes.
- Tracked in `NATIVE_MVP_PLAN.md` as **P16** ("HealthKit + Health Connect read
  of weight + steps. Opt-in toggle in profile."), explicitly sequenced after
  **P15** (push notifications, Expo-Go-compatible) because P16 needs a dev
  build.
- `expo/gap_analysis/GAPS.md` confirms the real gap: the actual native
  bridges — `react-native-health` (iOS) and `react-native-health-connect`
  (Android) — aren't in Expo Go's prebuilt module set, so today the adapters
  are wired to test fakes only. Neither package is in `expo/package.json`
  yet. Real end-to-end behavior needs a **dev build** (tracked as **P21**)
  and a physical device.
- There is currently no webapp endpoint that receives the samples the native
  adapter would produce — `webapp/app/api/` has no `health` route. Weight
  entered manually goes through `/api/weight`; a Health-sourced weight sample
  would need a similar sync path (likely reusing `/api/weight` with a
  `source: "healthkit"` tag, or a small dedicated route) once the native side
  is real.

So "needs a native application" is true for Apple Health, but it is not a
blocker in the sense of "we'd need to start a new project" — it's a
**partially-built, already-sequenced native feature (P16/P21)** that just
hasn't reached its turn yet. Standing up the dev build and wiring the real
`react-native-health` / `react-native-health-connect` bridges is real work,
but it's scoped work, not open scope.

## 2. Cloud wearable APIs that are doable right now, no native app, no approval

These are server-side OAuth2 integrations the Next.js webapp could implement
directly — same shape as the existing magic-link/JWT auth, just a second
"connect a provider" flow per service, no native app involved at all:

- **Oura** (`cloud.ouraring.com/oauth/authorize`, `api.ouraring.com/v2`) —
  standard OAuth2 authorization-code flow, self-serve app registration, no
  review queue. (Personal access tokens were deprecated Dec 2025 — must use
  OAuth2 for any new integration.)
- **Whoop** (`developer.whoop.com`) — OAuth2 authorization-code flow, free,
  self-serve app registration in their dashboard. The one catch: testing
  requires an actual Whoop device with an active membership.
- **Strava** — OAuth2, and as of June 2026 the "Standard Tier" (up to 10
  users, higher rate limits than before) is self-service with no approval
  queue, provided the registering developer has an active Strava
  subscription. A larger user base needs the separate "Extended Access"
  application.

A minimal version of all three follows the same pattern: a `Connection`-style
model (userId, provider, access/refresh token, scope, expiry) plus a
`/api/integrations/[provider]/connect` + `/callback` pair per provider. None
of this needs Apple/Google/Samsung/Garmin approval — it's gated only by
Become writing the code and registering a developer app with each provider.

## 3. Needs approval or has a real waiting period

- **Samsung Health** — OAuth2 authorization-code flow exists and is
  well-documented, but registration goes through a gated developer program at
  `developer.samsung.com` with manual review before a `client_id`/`client_secret`
  is issued. Doable, but not same-day.
- **Garmin** — the Garmin Connect Developer Program is **currently not
  accepting new applications** ("stay tuned for more updates"), reported on
  hold through 2026 with no ETA. This isn't a matter of filling out a form
  faster — new sign-ups are closed. Existing approved partners keep working;
  Become is not one.
- **Fitbit / Google Health API** — the legacy Fitbit Web API (simple OAuth2,
  no restricted-scope review) is being **shut down in September 2026**;
  Google is not accepting new integrations against it. Its replacement,
  the **Google Health API**, uses Google OAuth 2.0, but every scope is
  classified "Restricted," which requires Google's privacy/security review
  before production access — a real lead-time item, not a same-sprint build.
  Net: if Fitbit-brand users matter, budget for the Google review cycle, not
  a quick OAuth app registration.

## 4. Alternative: pay an aggregator instead of building N integrations

Terra, Vital (rebranded **Junction** in 2025), and Spike all sell "OAuth once,
get normalized data from hundreds of wearables" as the product — they own the
per-provider OAuth relationships and rate-limit handling and hand Become one
API and one webhook format.

- **Terra**: $399–499/mo (annual/monthly) base tier, 100k credits included.
- **Vital/Junction**: ~$0.50/user/month, $300/month minimum.
- **Spike**: broadest surface (wearables + medical IoT + lab OCR), but Spike
  Technologies was acquired by Raintree Systems in July 2026 and their public
  materials since the acquisition don't mention the wearables API — worth a
  direct check with them before counting on it.

None of these replace the Apple Health native-app requirement (they still
need the user's phone to relay HealthKit data on iOS, same as building it
in-house) — they only remove the per-provider OAuth/normalization work for
the cloud services in section 2 and 3. Worth it if Become wants five-plus
providers fast and can carry the recurring cost; not worth it for just
Oura/Whoop/Strava, which are each a small, self-serve build.

## Bottom line

- **Right now, no approval needed:** Oura, Whoop, Strava — standard OAuth2
  webapp work.
- **Right now, needs a native app:** Apple Health, Android Health Connect —
  and Become already has the app and the adapter scaffolding (P16); the
  remaining work is the dev-build step (P21), the real `react-native-health`
  / `react-native-health-connect` bridges, and a backend sync endpoint.
- **Needs approval before any code matters:** Samsung Health (gated review),
  Garmin (program closed to new applicants, no ETA), Google Health API for
  Fitbit-brand data (restricted-scope security review). Fitbit's legacy API
  is sunsetting and isn't worth building against.
- **Buy-vs-build:** an aggregator (Terra/Vital-Junction) can shortcut
  sections 2–3 for a recurring fee; it does not change the Apple Health
  native-app requirement.

Sources: Apple HealthKit architecture (themomentum.ai, openwearables.io);
Google Fit/Health Connect/Google Health API migration (developers.google.com,
thryve.health, mindbowser.com); Fitbit Web API sunset notice
(community.fitbit.com); Whoop developer docs (developer.whoop.com); Oura API
docs (cloud.ouraring.com/docs); Garmin Connect Developer Program status
(spikeapi.com, aifitnessapi.com); Samsung Health developer docs
(developer.samsung.com, openwearables.io); Strava API rate limits and 2026
tier changes (developers.strava.com); Terra/Vital/Spike pricing and scope
comparison (sahha.ai, nextbuild.co); this repo's `NATIVE_MVP_PLAN.md`,
`expo/gap_analysis/GAPS.md`, and `expo/lib/health/*`.
