# Release process

How to ship a new version of the Become native app to TestFlight + Play
Internal Track. The build/submit pipeline runs on **EAS** (Expo Application
Services).

## Prerequisites (one-time)

1. **Apple Developer membership** for `io.redbtn.become`. Apple Team ID +
   Apple ID + App Store Connect App ID populated in `eas.json` `submit.production.ios`.
2. **Google Play Console** entry for `io.redbtn.become` with a service-account
   JSON key (writer role) at `expo/play-store-service-account.json`. Treat the
   key as a secret — `.gitignore` it.
3. **EAS account** linked to the Expo dashboard. Run `eas login` once and
   `eas init` to bind this directory to an Expo project ID.
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

## Cutting a release

```bash
# 1. Bump version. EAS handles iOS buildNumber + Android versionCode via
#    `autoIncrement: true` in production profile; only marketing version
#    needs a manual bump in app.json.
cd expo
# Edit app.json: bump expo.version (e.g. 0.1.0 → 0.1.1).

# 2. Run the test triad to make sure we're shipping green code.
npm run typecheck
npm run lint
npm test

# 2b. Run the accessibility device pass — ACCESSIBILITY.md's checklist. The
#     suite cannot lay text out or speak: VoiceOver / TalkBack over sign-in to
#     Home, the largest Dynamic Type size and Reduce Motion are checked on one
#     iPhone and one Android device, by hand, on the candidate build.

# 3. Build for both platforms. Production builds use the `production` profile
#    declared in eas.json — bundles app-bundle (.aab) for Android, .ipa for iOS.
eas build --platform all --profile production
# This kicks the build off in EAS cloud. Output: signed .ipa + .aab artifacts.
```

**The build needs `../shared`, and it gets it.** `@become/api-client` is linked
into `node_modules` from outside this directory
(`"@become/api-client": "file:../shared/api-client"`), so a build that uploaded
only `expo/` could not install, let alone bundle. `eas build` archives from the
ROOT of the git repository and builds in the project subdirectory, and
`shared/` is tracked git content with no `.easignore` excluding it — so it
travels with every build. Keep it that way: an `.easignore` added later must
not exclude `shared/`.

## Submitting

```bash
# 4. Submit the built artifacts to App Store Connect + Play Internal Track.
#    Reuses the credentials block in eas.json under submit.production.
eas submit --platform all --profile production
```

Submit defaults:
- iOS → TestFlight (no review required; just internal testers see it
  immediately, external testers after Apple beta review).
- Android → Play Internal Track (no review; internal testers see it
  immediately, promote to Open/Production via the Play Console UI).

## App Store Connect (iOS) checklist

| Step | Where | Notes |
|---|---|---|
| Accessibility device pass | One iPhone + one Android device | `ACCESSIBILITY.md` → Device QA checklist: VoiceOver / TalkBack from sign-in to Home, largest Dynamic Type, 44-point targets, Reduce Motion |
| Build appears in TestFlight | App Store Connect → TestFlight tab | Usually 10-30 min after `eas submit` |
| Internal testers added | TestFlight → Internal Testing group | Up to 100 internal testers — no Apple review |
| External tester beta review | TestFlight → External Testing group | Apple review takes ~24h, only for the first submission of a new version |
| Privacy form filled | App Store Connect → App Privacy | See "Apple App Privacy form" below |
| Submit for App Review | App Store Connect → Distribution | When ready to go GA |

## Play Console (Android) checklist

| Step | Where | Notes |
|---|---|---|
| Release available on Internal Track | Play Console → Internal Testing | Immediate after `eas submit` |
| Promote to Closed Testing | Play Console → Closed Testing | Adds Google review (~hours) |
| Promote to Open Testing / Production | Play Console → Production | After enough internal validation |
| Data Safety form filled | Play Console → Data Safety | See "Google Data Safety form" below |

## What the build already answers for you

Two questions an iOS upload normally stops to ask are answered in `app.json`,
so `eas submit` does not need a person:

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
| **Health & fitness** | Weight | Yes | Yes (HealthKit opt-in) | Sync from Apple Health / Health Connect |

We do NOT collect: precise location, financial info, photos, audio, contacts,
calendar, files, advertising IDs. Data is encrypted in transit (HTTPS). Users
can request deletion via in-app account → delete.

## Rollback

If a release ships with a serious regression:

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

## Validating eas.json locally

Without an EAS account, the schema can be parsed and asserted via
`__tests__/easConfig.test.ts` — it verifies 3 profiles, production has both
iOS + Android entries, channels are named correctly, and the submit block
points at io.redbtn.become. The full `eas build:configure --dry-run` flow
requires an EAS account; run it once during onboarding to wire credentials.

## Memory hooks

- `feedback_deployment` — Become deploys via RedRun (webapp side). The native
  app deploys via EAS / TestFlight / Play. These are unrelated pipelines.
- `feedback_black_translucent` — Verified by `__tests__/iosConfig.test.ts`
  to ensure no regression sneaks in via the release process.
