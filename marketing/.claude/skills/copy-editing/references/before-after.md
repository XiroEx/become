# Before and After

Worked edits across the surfaces Become actually writes for. Each shows the draft, the marked
changes, the reasons, and the final. Use these as the model for your own marked diff output.

---

## 1. Hero lead (landing page)

**Before (30 words), from `webapp/components/landing/BecomeLanding.tsx`:**

> Coach-built programs, photo-powered nutrition tracking, live workout logging, and daily mindset
> work — organized into one clear plan, so you always know exactly what to do next.

**Marked:**

- ❌ `photo-powered` → ✅ `photo` (adjective stacking, and "powered" adds nothing)
- ❌ ` — ` → ✅ `. ` (em dash policy; two sentences read better at 390px)
- ❌ `always know exactly` → ✅ `know` ("always" and "exactly" are both intensifiers)
- ❌ `daily mindset work` → ✅ `mind sessions` (matches the hub name on screen)

**Reasons:**

1. [slop] "photo-powered" stacked an adjective onto a mechanic that is already interesting.
2. [slop] Em dash replaced with a period.
3. [rhythm] "always know exactly what to do next" ended on a weak trailing phrase.
4. [concreteness] "mindset work" is not what the app calls it. The hub is Mind.

**After (24 words):**

> Coach-built programs, food logged from a photo, live set tracking, and mind sessions. One plan, so
> you know what to do next.

Word count 30 to 24. No claims flagged. Register unchanged.

---

## 2. Hero footnote

**Before:** `Built by coach Jon Don · Sign up with just your email` (52 chars)

**Marked:** ❌ `just` → ✅ (delete)

**Reason:** 1. [slop] "just" minimizes the reader's effort and is on the banned list. The sentence is
stronger without it, and it frees four characters.

**After:** `Built by coach Jon Don · Sign up with your email` (47 chars)

Small edit, and it is the highest-frequency banned word in the whole repo. Worth catching every time.

---

## 3. Feature block (AI generator)

**Before (41 words):**

> Our cutting-edge AI engine leverages your personal data to intelligently generate fully
> personalized workout sessions tailored specifically to your unique goals, experience level, and
> available equipment — so you can train smarter, not harder.

**Marked:**

- ❌ `cutting-edge AI engine leverages` → ✅ `Tell it` (unfalsifiable adjective plus filler verb)
- ❌ `intelligently generate fully personalized ... tailored specifically to your unique` →
  ✅ `builds the session` (five modifiers around one verb)
- ❌ ` — so you can train smarter, not harder` → ✅ (delete) (em dash plus an AI-slop symmetry)
- ✅ added: the real inputs, which are the ones the generate sheet collects

**Reasons:**

1. [slop] "cutting-edge," "leverages," "intelligently," "fully," "specifically," "unique" all cut.
2. [slop] "train smarter, not harder" is the "not just X but Y" pattern.
3. [concreteness] Named the actual inputs: focus, difficulty, equipment, exercise count. Verified
   against `generate-light.webp` in `webapp/public/screenshots/v2/`.
4. [rhythm] Ended on the verb.

**After (21 words):**

> Tell it your focus, your difficulty, and what equipment you have. It builds the session, exercise
> by exercise.

---

## 4. Email subject line

**Before:** `🎉 Welcome to your fitness journey with Become! 🎉` (49 chars)

**Marked:**

- ❌ emoji bookends → ✅ (delete)
- ❌ `your fitness journey` → ✅ (delete)
- ❌ exclamation mark → ✅ (delete)

**Reasons:**

1. [slop] Two emoji in a transactional subject reduce deliverability and read as a mailing list.
2. [slop] "journey" is banned.
3. [fit] Subject budget is 28 to 42 characters. The original spent 21 of them on decoration.

**After:** `Your sign-in link` (17 chars)

Alternate, warmer, still inside budget: `Your link is here. First session next.` (37 chars)

---

## 5. Push notification (streak at risk)

**Before:** Title `Don't lose your streak! 😰` / Body `You haven't logged a workout in 3 days.`

**Marked:**

- ❌ `Don't lose your streak!` → ✅ `Day 6 is still holding.`
- ❌ 😰 → ✅ (delete)
- ❌ `You haven't logged a workout in 3 days.` → ✅ `Log anything today and the streak stays.`

**Reasons:**

1. [slop] Anxiety emoji in a habit nudge is manipulation, not information.
2. [truth] The original counts a failure back at the user. That is guilt framing, which we do not do.
3. [concreteness] The replacement gives an achievable action inside the 40-character title budget.
4. [fit] Title 23 chars, body 40 chars. Both inside the push limits.

**After:** Title `Day 6 is still holding.` / Body `Log anything today and the streak stays.`

---

## 6. Directory blurb (160 chars)

**Before (188 chars, over budget):**

> Become is the ultimate all-in-one fitness solution, trusted by thousands, that seamlessly combines
> AI-powered training, nutrition tracking, and mindset coaching to transform your body and mind.

**Marked:**

- ❌ `trusted by thousands` → ✅ (delete, flag) (fabricated count)
- ❌ `ultimate all-in-one ... solution` → ✅ `one app` (three banned or abstract terms)
- ❌ `seamlessly combines` → ✅ (delete)
- ❌ `transform your body and mind` → ✅ (delete) (promised outcome)
- ✅ added: the coach, and the two distinctive mechanics

**Reasons:**

1. [truth] "trusted by thousands" is unsourceable. Flagged and removed permanently.
2. [truth] "transform your body and mind" promises a result we cannot promise.
3. [slop] "ultimate," "all-in-one," "solution," "seamlessly" cut.
4. [concreteness] Replaced with the two mechanics that make us different.
5. [fit] 188 to 157 characters, inside the 160 limit.

**After (157 chars):**

> Coach-built training programs, food logged from one photo of the plate, mind sessions, and a weekly
> recap. Free today, sign in with an email link.

**Claims flagged:** "trusted by thousands" removed. No user count may be published. Verifier: nobody,
this number does not exist.

---

## 7. When the right answer is not to edit

**Draft, Jon's voice, for a caption:**

> I'm not going to pretend the first two weeks are fun. They're not. You're learning the movements,
> your numbers are low, and nothing looks different yet. Week three is where it starts paying you
> back. Stay in it.

**Verdict: leave it.** Passes 1 and 5 only.

- [truth] "Week three is where it starts paying you back" is a coach's experience claim, stated as
  his own, not as a product promise or a guaranteed timeline. Acceptable in first person. Flag it for
  Jon's sign-off rather than editing it.
- [fit] Caption length is fine.
- Passes 2, 3, 4 skipped. "I'm not going to pretend" is the reason the paragraph works. Polishing it
  into "The first two weeks are demanding" removes the person from it.

Anything structural here goes to `coach-brand-voice`.

---

## Marked diff format to use

```
Word count: 58 → 27 (-53%)
Register: product (second person). Unchanged.

❌ Become isn't just another fitness app — it's a comprehensive, all-in-one platform...
✅ Become runs the whole plan: coach-built programs, food logged from a photo, mind
   sessions, and a weekly recap.

1. [truth]        "Trusted by thousands" cut. No user count exists. Flagged.
2. [truth]        "the results you deserve" cut. Promised outcome.
3. [slop]         "isn't just X, it's Y," "comprehensive," "all-in-one," "platform," cut.
4. [slop]         Em dash replaced with a colon.
5. [concreteness] "AI" replaced with what it does.
6. [rhythm]       27/24/7 word sentences became 9/13/5.
7. [fit]          Section lead budget 20-35 words. Final 27.
```
