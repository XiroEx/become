# Accessibility baseline (NP-124)

The primitives carried roles and labels from the first component pass, and
**nobody had opened the app with VoiceOver on or the text size at its largest**.
Counting labels is not a test: while 38 `accessibilityRole`s and 55
`accessibilityLabel`s were in the tree, the settings gear was a 36-point target,
the modal backdrop was a full-screen "Close modal, button" sitting in front of
every dialog, a button that started loading lost its name entirely (the spinner
replaces the label, and a spinner has no name), the streak message was read as a
fragment unrelated to the streak, the drag handle announced a gesture VoiceOver
cannot make, and "Log weight" / "Skip today" sat side by side at their intrinsic
width — which at the largest Dynamic Type size is wider than the phone.

This file is the baseline those bugs produced: four rules, where each one lives,
what the suite can prove, and the device pass that has to happen on hardware.

## The four rules

### 1. Every interactive element has a role and a label

A role says what a control IS ("button", "switch", "radio"); a label says what it
DOES in this particular place. A control missing either one does not exist to a
member using the screen curtain.

- **The label may come from the words inside** — a `<Button>` whose child is
  "Save check-in" needs nothing else — but `components/Button.tsx` computes it
  (`accessibleName`) rather than leaving it to React Native, because the moment
  `loading` is true the label is replaced by an `ActivityIndicator` and the name
  would go with it.
- **`Toggle`'s `accessibilityLabel` is a REQUIRED prop.** A switch has no words
  of its own; the row label beside it is a different element and is not the
  switch's name. A type error is the only check that catches the next one that
  forgets.
- **A group that reads as one fact is one element.** `accessible` on the
  container plus a composed label: the streak banner
  (`streakAccessibilityLabel`) and today's workout on Home
  (`todayWorkoutSummaryLabel`) are each one swipe, not three or four.
- **Decoration is hidden, not described.** The sheet's grab bar and the modal
  backdrop carry `accessible={false}` / `importantForAccessibility="no"`. The
  backdrop stays tappable for a sighted member; VoiceOver gets the two-finger
  scrub instead (`onAccessibilityEscape` on the card), which is the platform
  gesture for "dismiss".
- **A state change that replaces content is announced.** iOS ignores
  `accessibilityLiveRegion`, so `lib/a11y/announce.ts` posts the announcement and
  the region is set for TalkBack: sign-in's "Check your inbox", onboarding's step
  change, and every error, which carries `accessibilityRole="alert"`.

### 2. 44 by 44 points, minimum

`lib/a11y/touchTarget.ts`. Two ways to hold it, and they are not
interchangeable:

| Helper | Grows | Use it for |
|---|---|---|
| `minTouchTarget` | the view | a padded icon button, a list row, an option in a questionnaire |
| `hitSlopToMinTarget(w, h)` | the touchable area only | a control whose size IS the design — the 48 × 28 switch track takes 8 points of vertical slop instead of becoming 44 tall |

`Button` at `md`/`lg` grows (they were a few points short); `sm` keeps its size
and takes slop, because the rest-timer bar puts three of them in one row.

### 3. Dynamic Type: nothing is capped, nothing is clipped

`allowFontScaling` defaults to true, so text already grows with the system
setting — and `allowFontScaling={false}` is not an allowed fix. What breaks at
the largest size is layout, in one way often enough to have a name in
`lib/a11y/dynamicType.ts`:

> **React Native's `flexShrink` is 0, where CSS's is 1.** A `<Text>` inside a
> flex ROW therefore keeps its intrinsic width at any font scale and runs off the
> end of its container instead of wrapping. That is what "the label is cut off"
> turns out to be, every time.

So a Text in a row gets `WRAPPABLE_TEXT`, and a row of controls that cannot wrap
gets `flex: 1` wrappers so each one owns a share of the width and its label wraps
inside it. Also banned on the v1 screens: `numberOfLines`, `ellipsizeMode`, and a
fixed `height` on anything containing text.

One thing that is NOT a bug: **the tab bar has no text to scale.** Since NP-351
the bar is `components/navigation/GlassTabBar.tsx` — the web's icon-only pill,
matching `webapp/components/BottomNav.tsx`, which labels its buttons with
`aria-label`/`title` and shows no text either. (Before that, react-navigation
drew labels with `allowFontScaling: false` on iOS 13+ by design and leaned on
the system Large Content Viewer.) Each button therefore carries the label as its
**accessible name**, in the exact shape the navigator used to compose — "Home,
tab, 3 of 7" — and now does so on Android as well, where react-navigation left
it undefined and relied on the visible label there is no longer any of. The
total counts the navigator's screens, hidden routes (`chat`, `calendar`)
included.

### 4. Reduce Motion is honoured

`lib/a11y/reducedMotion.ts`. React Native applies none of it for us:
`Modal.animationType` animates, moti's `from`/`animate` animates, every
Reanimated `withTiming` runs. `useReducedMotion()` reads
`AccessibilityInfo.isReduceMotionEnabled` and follows `reduceMotionChanged`
while the app is open; `modalAnimation()` turns the fade and the slide into a
cut; `motionDuration()` zeroes a duration while keeping the end state (the thing
still has to arrive).

**The rule that travels:** a file that imports `moti` or
`react-native-reanimated` must also reach for `useReducedMotion` /
`motionDuration`. `__tests__/reducedMotion.test.tsx` sweeps `app/`, `components/`
and `lib/` and fails on the first one that does not — a reduced-motion bug is
invisible to everybody whose phone has the switch off, which is everybody who
builds it.

## What the suite proves, and what it cannot

`__tests__/accessibility.test.tsx` renders the v1 screens — sign-in (both
states), the consent seam, onboarding (first and last step), Home (with and
without the check-in modal), Settings (with and without the delete
confirmation) — and walks the rendered tree the way a screen reader does
(`test-support/a11y.ts`):

- every node that responds to a touch has a role from the interactive set and a
  non-empty accessible name, unless it is explicitly hidden from assistive
  technology;
- every one of them guarantees 44 × 44 in NUMBERS (`minWidth`/`minHeight` or
  `hitSlop`) — NativeWind padding cannot count, because a className is never
  resolved in jest and padding around a 20-point icon is exactly how the gear
  came to be 36 points;
- sign-in → onboarding → Home is driven end to end **using only queries by role
  and accessible name**, which is what VoiceOver exposes and all it exposes;
- announcements fire, errors are alerts;
- at `LARGEST_DYNAMIC_TYPE_SCALE` (3.12 — iOS AX5, 53pt body against 17pt) no
  Text turns scaling off, limits its lines or ellipsizes, no text sits in a
  fixed-height box, and every text-bearing child of a row can shrink.

**It cannot lay text out.** jest has no text engine, so "no text is cut off" is
enforced as the absence of the constructions that cut text off, plus a render at
the largest multiplier. It also cannot speak: the ORDER VoiceOver reads in, the
feel of the swipe path and the Braille output are hardware facts. That is the
device pass below.

## Device QA checklist

Run this on one iPhone and one Android device before a release candidate goes to
TestFlight / Play internal testing (it belongs to NP-118's device QA round, and
`RELEASE.md` links here).

### VoiceOver (iOS) / TalkBack (Android)

Triple-click the side button with the Accessibility Shortcut set to VoiceOver, or
Settings → Accessibility → VoiceOver. Then, **without looking at the screen**:

- [ ] Sign in: swipe to the email field, type, swipe to "Send magic link",
      activate. The "Check your inbox" state is ANNOUNCED, not discovered.
- [ ] Open the magic link from Mail. The verify screen says "Signing you in",
      then Home loads.
- [ ] A new member: complete all four onboarding steps. Each option announces as
      a radio (or a checkbox on the equipment step) with its selected state, and
      the step change is announced.
- [ ] Home: the greeting is a heading; the streak reads as one sentence
      including the freeze when it is available; today's workout reads as one
      sentence; "Start workout" names the workout; the gear is "Settings".
- [ ] Check-in: the mood row is a radio group of five, and the weight field is
      labelled. Save announces the result.
- [ ] Settings: headings for Settings, Log weight, Health sync, Delete account.
      The delete dialog confines VoiceOver to itself, and the two-finger scrub
      dismisses it.
- [ ] Nothing announces itself as a control that cannot be activated, and no
      screen has an unnamed "button".

### Largest Dynamic Type

Settings → Accessibility → Display & Text Size → Larger Text → turn on **Larger
Accessibility Sizes** and drag to the maximum (AX5). On Android: Font size at
maximum AND Display size at maximum.

- [ ] Sign-in, onboarding (all four steps), Home, the check-in modal, Settings
      and the delete dialog: no label is clipped, no button's text is cut, no
      row pushes a control off the edge.
- [ ] Every button is still tappable — nothing has grown off the bottom of a
      scroll view (scroll to the end of each screen).
- [ ] Tab bar: icon-only, so nothing to clip — but VoiceOver/TalkBack still
      reads each button as "Home, tab, 3 of 7", and no screen's last row hides
      behind the floating pill (scroll each tab to the end).

### 44-point targets

- [ ] With Accessibility Inspector (Xcode → Open Developer Tool) run the Audit on
      each v1 screen: no "hit area" or "element description" findings.
- [ ] The settings gear, the switch, the mood buttons and every option row are
      comfortable one-handed, not fiddly.

### Reduce Motion

Settings → Accessibility → Motion → Reduce Motion (Android: Remove animations).

- [ ] The check-in modal and the delete dialog appear and disappear without
      travelling or fading.
- [ ] Toggle the setting while the app is in the foreground: the next dialog
      obeys the new value without a relaunch.

## Known gaps, on purpose

- **The plan page has no native screen yet.** The card lists it; prices, the
  Free/Plus table and Manage billing are NP-050 and NP-053
  (`gap_analysis/PARITY_GAP_ANALYSIS.md` → "Plan page, prices and Manage
  billing": Missing). `__tests__/accessibility.test.tsx` fails the day a route
  with "plan" in its name appears, which is the reminder to add it to the walk.
- **The walk covers the six screens this card names.** The live workout,
  nutrition, calendar and chat screens are held to the app-wide source rule (no
  file may hold more touchables than roles) and to the primitives' behaviour, but
  they are not walked yet. The next screen-level accessibility card extends
  `V1_SCREENS`.
- **Haptics are still deferred** (`IOS_QUIRKS.md` → Haptic feedback), so there is
  nothing for a "reduce haptics" preference to honour yet.
