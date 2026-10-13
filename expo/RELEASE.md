# Release process

How to ship a new version of the Become native app to TestFlight + Play
Internal Track.

**There is no Expo-hosted service in this pipeline and no over-the-air
updates** (George, 2026-09-30). No EAS Build, no EAS Submit, no EAS Update, no
Expo Push, no expo.dev project — and therefore no `eas.json` and no
`expo-updates` in the dependency tree, which
`scripts/check-no-ota.mjs` fails the `expo` CI job over. Expo *libraries* and
the *CLI* are fine and are what this document uses: `npx expo prebuild`
generates the native projects, `npx expo export` is the bundler check CI runs,
and the archive is built locally by Xcode and Gradle.

Every change — JS or native — therefore ships as a **store build**. An urgent
one ships as a store build plus the **minimum-version gate** (NP-041), which is
the only lever that reaches an already-installed app. See
[Releasing a fix](#releasing-a-fix-there-is-no-ota).

## Prerequisites (one-time)

1. **Apple Developer membership** for `io.redbtn.become`, with the Apple ID on
   the team that owns the App Store Connect app record. Nothing in the repo
   stores those identifiers any more (`eas.json`, which held placeholders for
   them, is gone): Xcode signs in and signs the archive.
2. **Google Play Console** entry for `io.redbtn.become`, and an upload keystore
   for the app bundle. Keep the keystore and its passwords in redsecrets, NOT
   in the repo — losing it means a new app listing. Play App Signing holds the
   release key.
3. **A build machine with the native toolchains**, because nothing builds in
   the cloud for us: macOS with Xcode (iOS archive + upload) and a JDK 17 +
   Android SDK for `./gradlew` (Android app bundle). The iOS half needs a Mac;
   the Android half runs anywhere.
4. **Bundle / package identifiers locked** in `app.json`:
   - `ios.bundleIdentifier = "io.redbtn.become"`
   - `android.package = "io.redbtn.become"`
   These cannot change without breaking install upgrades.
5. **Universal Link AASA file** served at
   `https://become.redbtn.io/.well-known/apple-app-site-association` with the
   real `TEAM_ID.io.redbtn.become` appID (placeholder ships in P6 — replace
   before the first iOS submission).
6. **assetlinks.json** served at
   `https://become.redbtn.io/.well-known/assetlinks.json` with the real Play
   App Signing SHA-256 fingerprint (placeholder ships in P6 — replace before
   the first Android submission).
7. **The store name and subtitle**, from
   [`STORE_LISTING.md`](./STORE_LISTING.md): one name (≤30 characters) used on
   BOTH stores, the 30-character iOS subtitle and the 80-character Play short
   description. The App Store name is reserved by creating the app record in
   prerequisite 1, which is also the only way to find out whether it is free —
   so that document carries a fallback ladder to try in order. It is a
   different name from the home-screen label (`app.json` → `expo.name`, which
   stays `Become`).

## Cutting a release

```bash
# 1. Bump the versions. ALL THREE live in app.json and all three are ours now:
#    EAS used to own the two counters remotely (`appVersionSource: "remote"`,
#    `autoIncrement: true`), and both stores reject an upload that reuses one.
#      - expo.version            marketing version, e.g. 0.1.0 → 0.1.1
#      - expo.ios.buildNumber    +1 on EVERY upload, even a re-upload
#      - expo.android.versionCode +1 on EVERY upload, must be an integer
cd expo
# Edit app.json, then `npm test` — storeDistribution.test.ts fails if either
# counter goes missing.

# 2. Run the test triad to make sure we're shipping green code.
npm run typecheck
npm run lint
npm test

# 2b. Run the accessibility device pass — ACCESSIBILITY.md's checklist. The
#     suite cannot lay text out or speak: VoiceOver / TalkBack over sign-in to
#     Home, the largest Dynamic Type size and Reduce Motion are checked on one
#     iPhone and one Android device, by hand, on the candidate build.

# 3. Generate the native projects from app.json. ios/ and android/ are NOT
#    committed (.gitignore), so this is how every build gets the plugins, the
#    Info.plist keys, the widget providers and the privacy manifest.
npx expo prebuild --clean

# 4a. iOS — archive and upload with Xcode.
open ios/Become.xcworkspace
#     Product → Archive, then Distribute App → App Store Connect → Upload.
#     (Or: xcodebuild -workspace ios/Become.xcworkspace -scheme Become \
#        -configuration Release -archivePath build/Become.xcarchive archive
#      then Transporter / `xcrun altool --upload-app` with an App Store
#      Connect API key.)

# 4b. Android — build the app bundle Play wants.
cd android && ./gradlew bundleRelease
#     Output: android/app/build/outputs/bundle/release/app-release.aab
```

**The build needs `../shared`, and a local build has it.**
`@become/api-client` and `@become/core` are linked into `node_modules` from
outside this directory (`"file:../shared/api-client"`), so the build has to run
inside a checkout of the WHOLE repository with `npm install` already done in
`expo/` — which is exactly what a local build is. (This is the thing a cloud
builder used to do for us by archiving from the repo root; now it is yours to
not break by copying `expo/` somewhere on its own.) If `npx expo export
--platform ios` works, the archive will bundle: that is the step CI runs for
precisely this reason.

## Submitting

Both uploads are by hand — there is no `submit` service in this pipeline:

- **iOS** → Xcode Organizer → *Distribute App* → *App Store Connect*
  (or Transporter with the `.ipa`). The build appears in App Store Connect →
  TestFlight after processing.
- **Android** → Play Console → *Internal testing* → *Create new release* →
  upload `app-release.aab`.

Upload defaults:
- iOS → TestFlight (no review required; just internal testers see it
  immediately, external testers after Apple beta review).
- Android → Play Internal Track (no review; internal testers see it
  immediately, promote to Open/Production via the Play Console UI).

## Releasing a fix (there is no OTA)

**Every fix is a store build. A JS-only fix is a store build too.** The web app
can be fixed by merging to `beta` or `main`, and the native app cannot: there
are no over-the-air updates in v1, by decision (George, 2026-09-30 — no
Expo-hosted services, which rules out EAS Update). An installed binary only
changes when the member installs another binary.

So a fix goes out like this:

1. **Fix it, bump it, ship it.** Merge to `beta`, then bump `expo.version`
   plus both counters and cut a release exactly as above. Nothing about a
   one-line JS fix is faster than a native one — plan on store processing
   (TestFlight minutes, Play Internal minutes, App Review hours to a day for a
   public release).
2. **If members must not keep running the broken build, raise the floor.** The
   minimum-version gate (NP-041) is the only thing that reaches an app that is
   already installed. It is server-side config, takes effect without a deploy,
   and does not wait for a store:

   ```json
   "app": {
     "ios":     { "minVersion": "0.1.1", "latestVersion": "0.1.1", "storeUrl": "https://apps.apple.com/app/id…" },
     "android": { "minVersion": "0.1.1", "latestVersion": "0.1.1", "storeUrl": "https://play.google.com/store/apps/details?id=io.redbtn.become" }
   }
   ```

   in `BECOME_RUNTIME_CONFIG` (see `webapp/RUNTIME_SECRETS.md`), served by
   `GET /api/app/config` and read on every cold start by
   `expo/lib/version/versionGate.ts`:

   | Set | What the member gets |
   |---|---|
   | `latestVersion` above the installed version | A dismissible banner once per version (`components/version/UpdateBanner.tsx`) |
   | `minVersion` above the installed version | A full-screen, undismissable "Update required" screen with a store button (`components/version/UpdateRequiredScreen.tsx`) |

   **Set `minVersion` only to a version that is actually downloadable on both
   stores.** It is a hard block: naming a build that is still processing locks
   every member out of the app with nothing to install. Raise it after the
   release is live, per platform — the two blocks are separate on purpose,
   because Apple and Google approve on their own schedules.

   The gate **fails open** (no network, a 500, or a payload it cannot parse →
   no block), so it cannot be used as a kill switch and an outage cannot lock
   anyone out.
3. **Nothing to roll back.** The bad build is already on devices; see
   [Rollback](#rollback) for what the stores actually let you do, which is stop
   NEW installs and push forward to a fixed one.

A self-hosted server speaking the open expo-updates protocol (our own
infrastructure, not Expo's) would change step 1, and is a possible later card —
only if George asks. Until then, assume no OTA.

## App Store Connect (iOS) checklist

| Step | Where | Notes |
|---|---|---|
| Accessibility device pass | One iPhone + one Android device | `ACCESSIBILITY.md` → Device QA checklist: VoiceOver / TalkBack from sign-in to Home, largest Dynamic Type, 44-point targets, Reduce Motion |
| Build appears in TestFlight | App Store Connect → TestFlight tab | Usually 10-30 min after the upload |
| Internal testers added | TestFlight → Internal Testing group | Up to 100 internal testers — no Apple review |
| External tester beta review | TestFlight → External Testing group | Apple review takes ~24h, only for the first submission of a new version |
| Privacy form filled | App Store Connect → App Privacy | See "Apple App Privacy form" below |
| **Name reserved and subtitle filled** | App Store Connect → App Information → Name, and [version] → Subtitle | **Blocking.** 30 characters each, copied from [`STORE_LISTING.md`](./STORE_LISTING.md). The name is reserved by creating the app record, so this is the FIRST thing done in App Store Connect, not the last |
| **Demo account filled in** | App Store Connect → App Review Information → Sign-in required | **Blocking.** See "Reviewer demo account" below — an app the reviewer cannot sign in to is rejected under Guideline 2.1 |
| **Permission audit green** | `npx jest __tests__/releaseCandidatePermissions.test.ts` | **Blocking.** NP-206: every permission v1 requests has its reason on both platforms; the manifest declares only what v1 uses. See "Pre-submission permission audit" below |
| Submit for App Review | App Store Connect → Distribution | When ready to go GA |

## Play Console (Android) checklist

| Step | Where | Notes |
|---|---|---|
| Release available on Internal Track | Play Console → Internal Testing | Immediate after the `.aab` upload |
| Promote to Closed Testing | Play Console → Closed Testing | Adds Google review (~hours) |
| Promote to Open Testing / Production | Play Console → Production | After enough internal validation |
| Data Safety form filled | Play Console → Data Safety | See "Google Data Safety form" below |
| **App name and short description filled** | Play Console → Main store listing | **Blocking.** The SAME app name as the App Store (30 chars) plus the 80-character short description, both copied from [`STORE_LISTING.md`](./STORE_LISTING.md) |
| Health apps declaration completed | Play Console → App content → Health apps | **Blocking.** Any `android.permission.health.*` in the manifest (NP-199 adds three) cannot be released until this is filled in and approved. See "Play health apps declaration" below |
| **Permission audit green** | `npx jest __tests__/releaseCandidatePermissions.test.ts` | **Blocking.** NP-206: the manifest declares only what v1 uses, each with its reason. See "Pre-submission permission audit" below |
| **Demo account in the release notes** | Play Console → App content → App access | **Blocking.** All functionality is behind sign-in; give the same demo email + review code. See "Reviewer demo account" below |

## Reviewer demo account

Become is passwordless, so there is no password to hand a reviewer and they
cannot read the inbox a magic link lands in. Both stores are given the SAME
thing: the demo email and a review code, typed on the normal sign-in screen
behind **"App reviewer? Use a review code"**.

What to put in the form:

```
Email: <review.email from BECOME_RUNTIME_CONFIG>
Password: <review.code from BECOME_RUNTIME_CONFIG>
Notes: Passwordless app. On the sign-in screen tap "App reviewer? Use a
       review code", enter the email above and the code above. The account is
       a demo account with sample data and a Plus subscription already
       applied; no purchase is required to see any screen.
```

Three things to check before you submit, all of them in
`webapp/RUNTIME_SECRETS.md` → `review`:

1. `review.enabled` is `true` in the production payload. It defaults to OFF, so
   a payload that has never had this section makes the code answer 404.
2. The code you paste is the code in the payload. Nothing caches it for more
   than a minute, so a rotation takes effect without a deploy — including
   mid-review, which is how you close the door the day the app goes live.
3. Sign in with it yourself, on the candidate build, on both platforms. That is
   the only check that covers the whole path; the suites cover the rest
   (`webapp/tests/unit/auth/reviewSignIn*.test.ts`,
   `__tests__/reviewSignIn.test.tsx`).

## What the build already answers for you

Two questions an iOS upload normally stops to ask are answered in `app.json`,
so the upload does not stop on them:

- **Export compliance.** `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` —
  HTTPS only, no crypto of our own, which is exempt. Without it App Store
  Connect asks on every build.
- **Privacy manifest.** `ios.privacyManifests` ships `PrivacyInfo.xcprivacy`
  with the four required-reason API categories the bundled modules use
  (file timestamp `C617.1`, user defaults `CA92.1`, system boot time `35F9.1`,
  disk space `E174.1`), `NSPrivacyTracking: false`, and the same three
  collected data types as the App Privacy answers below. Without it the upload
  comes back with ITMS-91053.

Both are asserted by `__tests__/iosConfig.test.ts`. If a new native module
touches another required-reason API, add its category there with the module.

**Permission usage strings** live in one place, `expo.ios.infoPlist` in
`app.json`, and `__tests__/permissionStrings.test.ts` fails the build when a
permission-bearing module arrives without one (ITMS-90683 otherwise). See
`IOS_QUIRKS.md` → "Permission usage strings".

## Pre-submission permission audit (NP-206)

Before the release candidate goes to either store, every permission it can
request must have a specific, honest reason in the member's language — Apple
rejects vague ones under guideline 5.1.1, and Play reviews the manifest
against the Data Safety form and the health apps declaration.

The v1 surface, verified against the installed config plugins and the
modules' own platform sources:

| Platform | Permission / key | What Become does with it |
|---|---|---|
| iOS | `NSCameraUsageDescription` | Meal photo for the estimate, food-barcode scan, food-label evidence, Mind mirror preview |
| iOS | `NSPhotoLibraryUsageDescription` | Pick a photo — meal, food label, avatar, feedback screenshot; nothing else is read |
| iOS | `NSMicrophoneUsageDescription` | Follow along as the member speaks their affirmation |
| iOS | `NSSpeechRecognitionUsageDescription` | Turn that speech into lit-up words |
| iOS | `NSFaceIDUsageDescription` | Unlock on reopen instead of a fresh sign-in link |
| Android | `CAMERA` | Same camera uses as iOS |
| Android | `RECORD_AUDIO` | Same affirmation uses as iOS |
| Android | `health.READ_WEIGHT` | Import weigh-ins the scale or another app recorded |
| Android | `health.WRITE_WEIGHT` | Write a Become weigh-in back out |
| Android | `health.WRITE_EXERCISE` | Write a finished workout out as a session |
| Android | `POST_NOTIFICATIONS` | Workout reminders, streak alerts — at the considered moment, never at first launch |

Rules that travel: no permission is a condition of using the app (every
refusal degrades — manual barcode entry, black-stage mirror, hold-to-affirm,
Settings nudges); notifications fire only from the explicit Turn on or the
end-of-onboarding hand-off, never at launch; HealthKit ships no strings until
NP-185 installs its module; nothing is saved to the photo library so there
is no `NSPhotoLibraryAddUsageDescription`.

The gate is `npx jest __tests__/releaseCandidatePermissions.test.ts` — it
pins the iOS key set, the full Android manifest (six runtime + the two
biometric install-time permissions, nothing else), each Android reason
anchored to its in-app copy, the considered-moment timing, the no-gating
fallbacks, and the NP-014 rule that a new permission-bearing module without
its string fails. A green run is the permission sign-off on both store
checklists above.

**Icons and the launch screen** are generated, not hand-exported:
`node scripts/generate-app-assets.mjs` writes `assets/icon.png` (1024 px,
opaque — App Store Connect rejects an icon with an alpha channel),
`assets/adaptive-icon.png` and `assets/splash-icon.png` from
`webapp/public/logo.png`. Re-run it when the real store icon replaces the
stand-in, and check `npx expo-doctor` still passes 21/21.

## Apple App Privacy form

Become collects these data types (declare in App Store Connect):

| Data type | Linked to user? | Purpose | Used for tracking? |
|---|---|---|---|
| **Email address** | Yes | Account, magic-link login | No |
| **User ID (JWT)** | Yes | App functionality (auth) | No |
| **Push notification token** | Yes | Notifications (workout reminders, streak alerts) | No |

We do NOT collect: name, phone, contacts, location, fitness raw data (HealthKit
read is opt-in + on-device only), photos, browsing history, financial data,
advertising data. The privacy nutrition label should select "Data Linked to You"
for the three types above and "Tracking: No".

## Google Data Safety form

Mirror image:

| Data category | Data type | Collected? | Optional? | Purpose |
|---|---|---|---|---|
| **Personal info** | Email | Yes | No | Account, magic-link |
| **Personal info** | User IDs | Yes | No | Authentication |
| **App activity** | In-app actions | Yes | No | Workout / mood / weight logs synced to backend |
| **Device or other IDs** | Push token | Yes | Yes (notifications off) | Push reminders |
| **Health & fitness** | Weight | Yes | Yes (health sync is opt-in, per direction) | Weigh-ins imported from Apple Health / Health Connect, stored with the member's weight history |
| **Health & fitness** | Exercise (workout sessions) | No — written out only | Yes (health sync is opt-in, per direction) | Workouts finished in Become are written to Health Connect; none are read back |

We do NOT collect: precise location, financial info, photos, audio, contacts,
calendar, files, advertising IDs. Data is encrypted in transit (HTTPS). Users
can request deletion via in-app account → delete.

## Play health apps declaration (Health Connect)

Play Console → **App content → Health apps**. Required, and BLOCKING, because
the manifest requests Health Connect permissions (NP-199). Answer it with
exactly this; the three permissions below are the whole list, and
`__tests__/androidHealthConnect.test.ts` fails the build if the manifest, the
code or this table drift apart.

**App type / category:** fitness and wellness coaching app. Health Connect is
used for the member's own weight and workout data, inside the app, at their
request.

| Permission | Data type | Access | Why Become asks | Where it is used |
|---|---|---|---|---|
| `android.permission.health.READ_WEIGHT` | Weight | Read | So a weigh-in recorded by the member's scale or another app appears in Become without being typed twice, on the day it was recorded | `lib/health/sync.ts` → `POST /api/weight` with `source: "health-connect"` |
| `android.permission.health.WRITE_WEIGHT` | Weight | Write | So a weigh-in logged in Become is available to the member's other health apps | `lib/health/sync.ts` → `exportWeighInToHealth` |
| `android.permission.health.WRITE_EXERCISE` | Exercise (session) | Write | So a workout finished in Become shows up as an exercise session alongside the rest of the member's activity | `lib/health/sync.ts` → `exportWorkoutToHealth` |

Declaration answers, in the words the form asks for:

- **Is Health Connect data shared with third parties?** No. It is not sold, not
  shared with third parties, and never used for advertising, marketing,
  profiling or any automated decision about the member. It is stored against
  their own account and shown back to them.
- **Is it used for anything other than the feature the member enabled?** No.
  Weight read from Health Connect appears in their own weight history and the
  targets computed from it; a written weigh-in or session is their own data
  going back out.
- **Is it processed on a server?** Weight is, yes: an imported weigh-in is sent
  to Become's own API (`POST /api/weight`) and stored with the member's history,
  tagged `source: "health-connect"` and de-duplicated on the sample's own id.
  Workouts written to Health Connect come FROM that API and are not re-read.
- **Is it retained after the member turns the feature off?** Weigh-ins already
  imported stay in their Become history (it is their weight log, and they can
  delete their account or the entry). Nothing further is read or written: each
  direction has its own switch in Settings and both are off by default.
- **Health permissions requested but not used?** None — see the table.
- **Privacy policy URL:** https://become.redbtn.io/privacy
- **Health data policy URL (the one the declaration and the Health Connect
  rationale link to):** https://become.redbtn.io/health-data
- **Where the rationale screen comes from:** the
  `react-native-health-connect` config plugin writes the
  `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent-filter and the
  Android 14+ `ViewPermissionUsageActivity` alias, so the "learn more" link in
  Health Connect's permission sheet has somewhere to land.
- **Minimum SDK:** 26, raised in `app.json` via `expo-build-properties` because
  the Health Connect client requires it.

## Rollback

If a release ships with a serious regression. **There is no bundle to roll
back** — no OTA means no previous bundle to serve, so "rollback" is only what
the two stores let you do to NEW installs, plus the version gate for the ones
already out there (see [Releasing a fix](#releasing-a-fix-there-is-no-ota)).

### Apple side
1. Go to App Store Connect → TestFlight (or App Store).
2. Expire the bad build. Internal testers immediately fall back to the
   previous build; external/production users do not (Apple does not allow
   rollback of a public binary).
3. Cut a hot-fix release as above. Apple will route users to the new build
   on next launch (or via app-store auto-update).

### Android side
1. Play Console → Production → Halt rollout. Stops further distribution.
2. Promote a previous release from Closed Testing back to Production (Play
   supports stepping back to an earlier versionCode within the same track).
3. For Internal Track regressions, just promote a different build.

## What keeps OTA and EAS out

Three things, because a decision in a document is not a guard:

- **`scripts/check-no-ota.mjs`** — fails on an `eas.json` anywhere in the repo,
  on `expo-updates` in `expo/package.json` OR anywhere in
  `expo/package-lock.json` (that is how a native module arrives transitively),
  on an `eas` script, and on `updates` / `runtimeVersion` / `owner` /
  `extra.eas` in `app.json`. Run it yourself with
  `node scripts/check-no-ota.mjs`.
- **The `expo` CI job runs it** as its first step, before any install.
- **`__tests__/storeDistribution.test.ts`** asserts the same four footprints
  and runs the guard against fixtures in both directions, so a guard that has
  quietly stopped detecting anything fails the suite. The webapp's
  always-running `verify` job repeats the file checks in
  `webapp/tests/unit/ci/nativeJobs.test.ts`, because the `expo` job is skipped
  on a PR that touches neither `expo/` nor `shared/`.

## Memory hooks

- `feedback_deployment` — Become deploys via RedRun (webapp side). The native
  app ships as a store build to TestFlight / Play; it has no OTA channel and no
  Expo-hosted pipeline. These are unrelated release paths.
- `feedback_black_translucent` — Verified by `__tests__/iosConfig.test.ts`
  to ensure no regression sneaks in via the release process.
