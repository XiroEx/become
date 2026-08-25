# Permission Prompt Timing and Copy

## The constraint that governs everything

A browser gives JavaScript no way to reopen the native permission dialog after a user denies it.
Calling `requestPermission()` again resolves straight to `denied`, with no UI shown. There is no
appeal and no second dialog.

`webapp/lib/push/reprompt.ts` encodes the only remaining lever: an **in-app** reminder pointing
the user at their browser or OS settings, shown first 7 days after the initial denial, then
roughly monthly for as long as permission stays denied. That is a salvage path with a low
recovery rate, not a plan.

**Treat the native prompt as a one-shot resource. Spend it only when the answer is likely yes.**

A PWA has no App Store settings screen and no native onboarding to lean on. The browser is the
whole surface. That makes the timing question sharper for Become than for a native app.

---

## The prompt ladder

Four rungs. Never skip a rung.

### Rung 0 — Do not ask

**Never fire a permission request when any of these is true:**
- It is the user's first session.
- The user has not completed a single meaningful action.
- The user is mid-task: mid-workout, mid-scan, mid-log, mid-onboarding question.
- Anything is loading.
- The user declined a pre-prompt in the last 7 days.

First-load prompting is the highest-denial moment in the entire product. The visitor has no
reason to trust the tray yet, and a no here is permanent.

### Rung 1 — Earn something first

Ask only after a **first earned win**. Any of these qualifies:
- A completed workout session.
- A first logged plate or barcode scan.
- A first mood check-in.
- A first generated session or program enrollment.

The win is what makes the nudge legible: the user now knows what a reminder would be about.

### Rung 2 — Our own pre-prompt, in our own UI

A soft ask we control, styled in the Become system. It costs nothing if declined because the
native dialog never fires.

The pre-prompt must state three things:
1. **What they will get.** Named, concrete.
2. **How often.** An honest number.
3. **That they can turn any of it off.**

```
❌ Enable notifications to get the most out of Become!
❌ Turn on notifications so you never miss a workout!!
✅ Want a nudge on your training days?
   About one a day. Turn any of them off in settings.
   [Yes, remind me]  [Not now]
```

Timing within the session: after the win animation settles, not on top of it. The user should be
looking at the result of what they just did.

**Context-specific variants convert better than a generic ask.** Fire the variant that matches
what they just did:

| After | Pre-prompt line |
|---|---|
| First completed session | `Want a reminder on your training days? About one a day.` |
| First logged plate | `Want a midday reminder to log food? One a day, and it takes 30 seconds.` |
| First mood check-in | `Want a daily check-in nudge? One a day, any time you pick.` |
| First streak reaching 3 | `Want a heads-up when your streak is live and the day is nearly gone?` |

### Rung 3 — The native dialog

Fire **only** on an explicit yes to the pre-prompt. Immediately, in the same user gesture, so
the browser accepts it as user-initiated.

If the user then denies at the native dialog, that is the end. Record it and hand off to the
reprompt cadence. Do not build a workaround.

---

## Decline paths

| Outcome | What happens next |
|---|---|
| Declines pre-prompt | Nothing changes. No penalty, no nag banner. Ask again after the **next different** earned win, at most once a week, at most three times total. |
| Declines pre-prompt three times | Stop asking. Surface push as an ordinary row in settings and let them find it. |
| Accepts pre-prompt, denies native dialog | Permission is gone. Hand off to the reprompt cadence: nothing for 7 days, then an in-app pointer to browser settings, then roughly monthly. |
| Accepts both | Send the nudge that matches the pre-prompt within 24 hours. If the first nudge they get is unrelated to what we promised, the promise was a bait. |

**"Not now" must cost nothing.** No dimmed UI, no locked feature, no repeated banner, no
confirmshaming. Any variant of "No thanks, I don't want to reach my goals" is a dark pattern and
is refused outright. See `marketing-psychology`.

---

## Recovering from a denial

The only honest recovery is the in-app reminder in `webapp/lib/push/reprompt.ts`, and it should
be quiet:

- Nothing for the first 7 days after denial.
- Then a dismissible in-app row, not a modal, explaining that notifications are blocked at the
  browser level and where to change it.
- Then roughly monthly, for as long as permission stays denied.
- The denial timestamp anchors to the **first** observed denial, so the cadence does not reset
  every page load while permission is still denied.

**Do not** re-prompt after every session. **Do not** dress the reminder as an error.
**Do not** gate any feature behind notifications.

---

## Measuring the prompt

Instrument these with `analytics-tracking` before changing anything:

| Event | Why |
|---|---|
| `pre_prompt_shown` | Denominator for everything below |
| `pre_prompt_accepted` | The real conversion lever, and the one we control |
| `pre_prompt_declined` | Feeds the once-a-week retry rule |
| `native_prompt_shown` | Should be close to `pre_prompt_accepted` |
| `permission_granted` | The only number that matters long term |
| `permission_denied` | Every one of these is permanent. Track the trigger that preceded it. |
| `subscription_pruned` | 404 and 410 responses prune dead subscriptions in `webapp/lib/pushNotification.ts`. Distinct from a revocation. |

Read grant rate as **grants divided by pre-prompts shown**, not divided by native prompts.
Otherwise a stingy pre-prompt looks like a great one.

Any external benchmark used to justify a timing choice must carry its tier label (Tier A
platform-published, Tier B named case study, Tier C vendor blog) and may never be restated as a
Become results claim in public copy.
