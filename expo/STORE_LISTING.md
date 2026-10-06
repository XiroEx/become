# Store name and subtitle

The **name** and **subtitle** fields on both stores: what they say, why, the
order the names get tried in, and the one step that is not code.

Scope is deliberately narrow. The rest of the listing copy — description,
keywords, promo text, screenshots — is card `6ab0282c` and is not in this
document. Build process is [`RELEASE.md`](./RELEASE.md).

Every count in this document is the raw `String.length` of the string in the
`Copy` column, including spaces and punctuation, and
`__tests__/storeNameAndSubtitle.test.ts` recomputes all of them. A copy edit
that breaks a store limit, or that leaves a count stale, fails the `expo` CI
job rather than a submission.

## There are three names, and this card is only one of them

Jon, on the card: *"Is this the name people see on the App Store or is this
talking about what is on Apple"*. A shipped app carries three names from three
different places, and they are allowed to differ:

| Name | Where it comes from | Limit | Value |
|---|---|---|---|
| Store listing name | App Store Connect → App Information → Name, and Play Console → Main store listing → App name | 30 | this card |
| Home-screen label | `app.json` → `expo.name` (becomes iOS `CFBundleDisplayName` and Android `app_name` at `expo prebuild`) | ~12 before a launcher truncates | `Become` |
| PWA install name | `webapp/lib/appChannel.ts` → `APP_NAME` / `APP_SHORT_NAME` | 45 / 12 | `Become` / `Become` |

Only the **store listing name** has to be free across the App Store, and it is
the only field this card changes. The icon on the member's home screen keeps
saying `Become`, in six characters, on both platforms — so Jon's *"Become
should be the name of the app"* is what ships: under the icon it **is** Become,
and the listing adds the words the store needs in order to tell us apart from
everything else already called Become.

## The decision

| Field | Where it is entered | Limit | Copy | Count |
|---|---|---|---|---|
| App Store name | App Store Connect → App Information → Name | 30 | `Become: Fitness & Mindset` | 25 |
| Play app name | Play Console → Main store listing → App name | 30 | `Become: Fitness & Mindset` | 25 |
| iOS subtitle | App Store Connect → [version] → Subtitle | 30 | `Workouts, meals, mind sessions` | 30 |
| Play short description | Play Console → Main store listing → Short description | 80 | `Coach-built training, food logged from a photo, and short mind sessions.` | 72 |
| Home-screen label | `app.json` → `expo.name` (unchanged by this card) | ~12 | `Become` | 6 |

One name on both stores, as the card requires: the App Store name and the Play
app name are the same string, character for character.

### Why these words

Jon's description of the product, on this card: *"become is a system used to
become the best version of yourself. it is a self improvement app that improves
people lives through fitness, minset, and nutrition."* So five words have to
survive into 30 + 30 characters, and each one may only be spent once —
Apple indexes the name and the subtitle together, so a word repeated across
them buys nothing.

- **The name spends its 30 on the brand plus the two words that separate us
  from a workout logger:** `Become`, then `Fitness` (the category search term)
  and `Mindset` (the half of the product that most fitness apps do not have).
  `Become` is first because search results truncate a name long before 30
  characters; the member reads `Become` either way.
- **The subtitle spends its 30 on the three hubs, in the product's own
  words:** `Workouts` (Training), `meals` (Nutrition), `mind sessions` (Mind).
  Plain nouns, no slogan — the subtitle is read in a results list beside the
  icon, not out loud.
- **The Play short description** carries the one mechanic that is actually
  unusual — a meal logged from one photo of the plate — and the coach, because
  Play shows it high on the listing and in the install sheet. It matches the
  60-character blurb already approved for the web listings
  (`marketing/launch/2026-09-01/listings.md` §1: "A coach's programs, food
  logged by photo, and mind work"), so the two listings do not read as two
  products.

### What this copy does not say, on purpose

- **No price, no "free", no "sale", no "#1", no "best", no emoji** in the name
  or the subtitle. Apple rejects price and promotional text in those fields
  (Guideline 2.3.7), Play rejects promotional text in the title, and a price
  claim in a name outlives the price.
- **No "(beta)".** That string belongs to the beta PWA channel
  (`webapp/lib/appChannel.ts`) and to no store field.
- **Nothing the app does not do.** The two claims the launch kit bans
  (`marketing/launch/2026-09-01/listings.md` §1) are easy to write by accident
  into a subtitle and are both absent here: the camera does not watch a set or
  count reps (every number in LIVE mode is typed), and not every exercise has a
  demo clip (39 of 132 do).

## Try the names in this order

A name is taken the moment some developer creates an app record with it, and
App Store Connect is the only thing that knows. There is no API to ask and
nothing in this repo can ask it — so the procedure is a ladder, not a single
string: try these in order, take the first one App Store Connect accepts, and
then use that exact string on Play too.

| Order | Candidate | Count | Why it is in the ladder |
|---|---|---|---|
| 1 | `Become` | 6 | Jon's answer, and it costs one minute to find out. Almost certainly taken; try it anyway before settling. |
| 2 | `Become: Fitness & Mindset` | 25 | The decision above. |
| 3 | `Become Fitness & Mindset` | 24 | Same words without the colon. |
| 4 | `Become: Fitness and Mindset` | 27 | Same words, `and` spelled out. |
| 5 | `Become: Train, Eat, Think` | 25 | The three hubs as verbs, if the `Fitness` variants are all gone. |
| 6 | `Become Daily: Fitness & Mind` | 28 | Last resort — adds a word to the brand, so only if 1-5 all fail. |

Every rung is ≤30 characters and every rung starts with `Become`, which is the
actual requirement: the name has to still read as Become. If all six are taken,
**stop and ask Jon** rather than inventing a seventh here — the brand word is
his call, and a name is expensive to change after launch (it is the one listing
field members and reviews refer to).

Record the rung that won in the sign-off table below, update the two name rows
in [The decision](#the-decision) to match it, and re-run
`npx jest __tests__/storeNameAndSubtitle.test.ts`.

## Reserving it

Not a code step, and not one an agent in this repo can do: there are no App
Store Connect or Play Console credentials in the container, by design. It needs
a human with an Account Holder or Admin seat, in a browser.

**App Store Connect** (needs the App Store Connect record and Team ID from card
`6ab0281d`): Apps → **+** → *New App* → Platform **iOS**, Name = the winning
rung, Primary Language, Bundle ID `io.redbtn.become`, SKU. Creating the record
**is** the reservation; the Name field is also where it is edited later (only
while no version is in review). The subtitle lives on the version, not the
record: *[version] → Subtitle*, so it can be filled the moment a version
exists.

Apple can reclaim a name from a record that never ships a build, so create the
record when the first TestFlight upload is weeks away, not months.

**Play Console** (needs the Play Console record from card `6ab02822`): *Create
app* → App name = the same string → then *Main store listing* → *Short
description*. Play does not reserve names, so a duplicate title is possible
there; use Apple's winner anyway so the two stores agree.

## Sign-off

| Acceptance | Status | Evidence |
|---|---|---|
| A name of 30 characters or fewer is reserved in App Store Connect | **Open** — needs a human in App Store Connect | The string is chosen and ≤30 (25), with a fallback ladder, but the container holds no App Store Connect credentials and card `6ab0281d` (the App Store Connect record itself) is still open. Nothing in this repo can reserve a name. |
| Subtitle (iOS) and short description (Play) are written | **Done** | [The decision](#the-decision): subtitle 30/30, short description 72/80, both length-checked by `__tests__/storeNameAndSubtitle.test.ts`. |
| Jon has signed off on the name | **Partly** — brand word yes, full listing name no | Jon on this card: *"Become should be the name of the app."* That settles the brand and the home-screen label, and is why every rung of the ladder starts with `Become`. He has not yet seen `Become: Fitness & Mindset` as the 30-character store name; that is a one-line yes/no on the card. |

When Jon answers and the record exists, fill this in:

- Rung reserved: `________________` (date, who, which Apple team)
- Jon's sign-off: `________________` (date, where he said it)

## Keeping this honest

`__tests__/storeNameAndSubtitle.test.ts` parses the two tables in this file and
fails if: a name or subtitle is over 30, the Play short description is over 80,
a printed count disagrees with the string, the App Store and Play names drift
apart, a ladder rung stops starting with `Become` or goes over 30, the chosen
name is not one of the rungs, the home-screen row stops matching `app.json`'s
`expo.name`, or `RELEASE.md` stops pointing at this document.
