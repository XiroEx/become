# App Store privacy answers and age rating

What Become answers on App Store Connect for **App Privacy** (the privacy
"nutrition label") and the **age rating** questionnaire, so the next submission
does not start from scratch. Board card: "Apple App Privacy labels and the 13+
age rating" (`6ab02838`).

The source for every answer is the Privacy Policy at `/privacy`
(`shared/core/src/legal/privacy.ts`, served from `webapp/lib/legal/privacy.ts`).
If the policy changes, re-check this file, and the other way round.

App Store Connect: app `6820370664`, seller **REDBTN LLC**. The data controller
named in the policy is **Become LLC**; the policy says the App Store seller is
REDBTN LLC in one sentence (section 2).

## Age rating (saved 2026-10-13, read back through the API)

| Question | Answer |
|---|---|
| Alcohol, tobacco or drug use or references | None |
| Contests | None |
| Gambling | No |
| Simulated gambling | None |
| Guns or other weapons | None |
| Health or wellness topics | **Yes** (fitness, nutrition targets, mindset) |
| Loot boxes | No |
| Medical or treatment information | None |
| Messaging and chat | No (members cannot message each other; the AI coach is not a person) |
| Profanity or crude humor | None |
| Sexual content or nudity | None |
| Sexual content, graphic, and nudity | None |
| Horror or fear themes | None |
| Mature or suggestive themes | None |
| Unrestricted web access | No |
| User-generated content | **Yes** (custom foods a member creates appear in every member's food search) |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Prolonged, graphic or sadistic realistic violence | None |
| Advertising | No |
| Social media | No |
| Parental controls | No |
| Age assurance | No |
| **Age rating override** | **13+** (`ageRatingOverrideV2: THIRTEEN_PLUS`) |

The answers alone compute to 4+. The override sets **13+** to match the Terms'
minimum age (`LEGAL_MINIMUM_AGE = 13`). Setting the override back to None
would ship at 4+.

## App Privacy (drafted 2026-10-13; entered on the website by George)

The form only exists on the App Store Connect website, so it cannot be set by
API. Status on 2026-10-13: drafted and with George to enter and publish. When it
is published, record the date in the sign-off line at the bottom.

**Tracking: No.** Nothing is used to track the member across other companies'
apps or websites, there is no advertising and no third-party ad or analytics
SDK. Every type below is **linked to the member** (it is stored against their
account) and **not used for tracking**. Purpose for each: **App Functionality**.

| App Store data type | What it is in Become |
|---|---|
| Contact Info: Email Address | Account email, sign-in links |
| Contact Info: Name | Display name |
| Health & Fitness: Health | Weight, body stats, injury notes, mood |
| Health & Fitness: Fitness | Workouts, sets, programs, streaks |
| User Content: Photos or Videos | Meal photos, avatar, progress photos |
| User Content: Customer Support | Feedback and support messages |
| User Content: Other User Content | Journal, notes, custom foods, meals, recipes (recipes are private by default) |
| Purchases: Purchase History | Plus subscription status from Stripe (the purchase itself happens on Stripe's web checkout) |
| Identifiers: User ID | Become account id |
| Identifiers: Device ID | The push token (raw APNs device token on iOS) |
| Usage Data: Product Interaction | Which features are used, AI allowance counts |
| Diagnostics: Other Diagnostic Data | App version, build, OS version and device model sent with feedback |

Third parties that receive data, as the policy lists them: MongoDB Atlas
(database, United States), the redbtn platform (hosting, MinIO image storage,
AI routing), Google Gemini (only after the member's separate AI consent),
Stripe (web checkout), Gmail SMTP (email), Apple Push Notification service and
Firebase Cloud Messaging (push). Sign in with Apple and Google sign-in are the
member's own choice of sign-in, listed as sources in the policy.

Privacy Policy URL to enter: `https://becomeurbest.com/privacy`.

## Sign-off

| Item | Date | By |
|---|---|---|
| Age rating saved (13+ via override) | 2026-10-13 | Red, through the App Store Connect API |
| App Privacy published | | |
