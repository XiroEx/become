# UTM Conventions and Campaign Naming

One grammar, lowercase, no exceptions. Every externally posted link to become.redbtn.io is
tagged, including Jon's link in bio, every directory listing, every email, and every ad.

---

## The five parameters

| Parameter | Meaning | Allowed values |
|---|---|---|
| `utm_source` | The specific property the click came from | `instagram`, `tiktok`, `youtube`, `producthunt`, `alternativeto`, `reddit`, `newsletter`, `discord`, `qr`, `linkinbio` |
| `utm_medium` | The mechanism | `social_organic`, `social_paid`, `email`, `push`, `referral`, `directory`, `affiliate`, `print` |
| `utm_campaign` | `yyyymm_theme_variant` | `202609_livemode_launch`, `202601_newyear_consistency` |
| `utm_content` | The specific creative or placement | `reel_repcount_hooka`, `story_frame3`, `carousel_plate` |
| `utm_term` | Paid keyword only | rarely used for Become |

Rules:
- **Lowercase everything.** `Instagram` and `instagram` are two rows in every analytics tool.
- **Underscores, not spaces or hyphens**, inside a value.
- **Source is a property, medium is a mechanism.** `utm_source=social` is the most common mistake
  and it destroys the report.
- **Never tag an internal link.** An internal UTM restarts the session and orphans the original
  source.
- **Destination is the real page.** Never an invented offer page, never a page with a price on it.

## Worked examples

| Placement | URL |
|---|---|
| Organic Reel, Become account | `https://become.redbtn.io/?utm_source=instagram&utm_medium=social_organic&utm_campaign=202609_livemode_launch&utm_content=reel_repcount_hooka` |
| Jon's link in bio | `https://become.redbtn.io/?utm_source=linkinbio&utm_medium=social_organic&utm_campaign=evergreen_coach&utm_content=jon_bio` |
| Product Hunt listing | `https://become.redbtn.io/?utm_source=producthunt&utm_medium=directory&utm_campaign=202609_ph_launch` |
| Meta paid, creator Spark ad | `https://become.redbtn.io/?utm_source=instagram&utm_medium=social_paid&utm_campaign=202610_paid_test1&utm_content=spark_creatorname_hookb` |
| Weekly recap email | `https://become.redbtn.io/dashboard?utm_source=newsletter&utm_medium=email&utm_campaign=evergreen_recap&utm_content=cta_primary` |
| QR on a printed card | `https://become.redbtn.io/?utm_source=qr&utm_medium=print&utm_campaign=202609_gym_cards` |

`evergreen_*` is the permitted exception to the date prefix, for links that live indefinitely.

## Campaign name grammar

`yyyymm_theme_variant`

- `yyyymm` is the month the campaign **starts**, not the month a given post goes out.
- `theme` is one or two words naming the thing being promoted: `livemode`, `platephoto`,
  `newyear`, `phase1drop`.
- `variant` is optional: `launch`, `test1`, `retarget`, `winback`.

Never encode the creative in the campaign name. That is `utm_content`, and keeping them separate
is what lets you compare five creatives inside one campaign.

## First-touch capture

UTMs die at the first internal navigation, and Become's signup crosses tabs and often devices. So:

1. On first public page view, read the UTM parameters and persist them (cookie or localStorage)
   as `first_touch_source`, `first_touch_medium`, `first_touch_campaign`, `first_touch_content`,
   plus `first_touch_at`.
2. Do not overwrite on later visits. Store a separate `last_touch_*` set if last-touch is wanted.
3. Attach `first_touch_*` to `signup_started` and to `account_created` server-side, so attribution
   survives the magic-link tab handoff.
4. If the link is opened on a different device, first-touch is lost for that account. Expect a
   meaningful "direct" bucket and do not explain it away.

## The link register

Keep one table, in the marketing plan or a tracked sheet, of every live tagged link.

| Link | Destination | Source | Medium | Campaign | Content | Owner | Live from |
|---|---|---|---|---|---|---|---|

Without a register, two people build two spellings of the same campaign and the report splits.
Check the register before minting a new link, and reuse an existing one where the campaign is
the same.

## What cannot be tagged

| Channel | Why | What to watch instead |
|---|---|---|
| AI assistants | Answers carry no tags; some pass a referrer, some pass nothing | Referrers `chatgpt.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com`; plus branded search and direct. See `seo-geo`. |
| Word of mouth | Someone types the name | Direct traffic and branded search |
| Screenshots shared in DMs | No link at all | Direct traffic spikes after a post |
| Some in-app browsers | Strip parameters | Compare platform mix on `page_viewed` |

Treat direct plus branded search as the "we were recommended" bucket. It is imprecise and it is
still the best available read on word of mouth and AI citation.

## Reporting shape

Report by `utm_medium` first (the mechanism), then by `utm_source`, then by `utm_content` for
creative comparison. Report **signups**, not sessions, as the primary column: sessions flatter
whichever channel sends the most curious clicks.

| Medium | Source | Sessions | Signups started | Accounts created | Activated |
|---|---|---|---|---|---|

Add an `N too small to read` note wherever a row is under about 30 signups. See
`references/funnel-definitions.md` and `ab-testing`.
