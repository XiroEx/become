# GEO Tactics: being the answer, not the link

Generative engine optimization. The unit of success is a **citation inside someone else's
answer**, which means the unit of work is a liftable passage, not a page.

---

## 1. What the research supports, and what it does not

The Princeton "GEO: Generative Engine Optimization" work (KDD 2024) ran controlled content edits
across a large query benchmark and measured which edits raised a source's visibility in
generative answers. The edits that moved the number:

| Edit | What it means concretely |
|---|---|
| Cite sources | Attribute factual statements to a named source with a date |
| Add statistics | Replace a vague magnitude with a specific, sourced number |
| Add quotations | Include a direct quote from a named expert |
| Authoritative tone | Declarative sentences, no hedging, no "may possibly help" |

Edits that did **not** reliably help: keyword stuffing, adding more keywords to the body, generic
"fluent" rewriting.

**Tier A as a study. Not a Become claim.** The lifts were measured on benchmark content in a
research setting, not on our site. Use it as a reason to write this way. Never restate a lift
percentage in public copy, in a pitch, or in a deliverable. It is not our result.

## 2. The answer passage

The single highest-leverage format change. Under every H2, write a self-contained answer of
**40 to 60 words** that makes sense with no surrounding context.

Rules:
- It answers the literal question in the H2, in the first sentence.
- It contains the specific noun, not a category word.
- It survives being pasted into a stranger's chat window.
- It carries one concrete mechanism, so quoting it teaches something.

❌ Weak passage:
> Staying consistent is one of the biggest challenges people face on their fitness journey.
> There are many strategies that can help, and finding what works for you is key.

✅ Strong passage:
> Most people do not quit training because of motivation. They quit because the next session is
> undecided. Fixing the days of the week, then letting a program name each session in advance,
> removes the decision at the door. In Become, you set training days once and the schedule fills
> itself in.

The strong version names the mechanism, is 55 words, and can be lifted whole.

## 3. Structure that engines can parse

| Do | Why |
|---|---|
| Question-shaped H2s | Matches the query string an engine is resolving |
| Answer immediately under the H2 | The first coherent paragraph is what gets lifted |
| Short paragraphs, 2 to 4 sentences | Chunking boundaries land cleanly |
| One table per comparison | Tables get extracted verbatim and cited |
| A definitional sentence early | "Become is a free web app for ..." is the sentence an engine repeats |
| Dates on facts | "Checked August 2026" makes a statement safe to reuse |
| Author byline and a real name | Attribution supports the authoritative-tone signal |

Anti-patterns: an intro before the answer, a listicle with no summary line, an FAQ whose answers
are one word, infinite scroll, and anything that only renders client-side.

## 4. Crawler access

If the crawler cannot read the page, none of this matters. Named agents to allow in
`webapp/app/robots.ts` (see `references/technical-checklist.md`):

| Agent | Belongs to | Purpose |
|---|---|---|
| `GPTBot` | OpenAI | training and retrieval |
| `OAI-SearchBot` | OpenAI | ChatGPT search index |
| `ChatGPT-User` | OpenAI | live user-triggered fetch |
| `ClaudeBot` | Anthropic | index and retrieval |
| `PerplexityBot` | Perplexity | index |
| `Google-Extended` | Google | Gemini and AI Overview grounding control |
| `Bingbot` | Microsoft | Bing and Copilot |
| `CCBot` | Common Crawl | feeds many downstream models |

Blocking any of them is a deliberate opt-out of that answer surface. For Become there is no
reason to block: we have no proprietary text worth withholding and every reason to be quotable.

Verify with a bounded fetch:
`timeout 30 curl -s -A "GPTBot" https://become.redbtn.io/robots.txt`

## 5. Off-site citation surfaces

Assistants disproportionately cite aggregators, forums, and roundups rather than vendor sites.
The single highest-value GEO work is often not on our domain at all.

Priority order for Become:
1. **AlternativeTo and similar directories.** They are the literal source for "X alternatives"
   answers. Owned by `web-app-listing`.
2. **Roundup and listicle sites** that rank for the T1 queries. Reach out with a factual product
   summary and a screenshot from `webapp/public/screenshots/v2/`. Never offer or accept payment
   for a fake review.
3. **Reddit and forum threads** where the question is asked repeatedly. Answer honestly, disclose
   the affiliation every time, and only where the product genuinely fits. Undisclosed shilling
   gets the domain banned and is a fabrication problem, not just an etiquette one.
4. **Product Hunt and launch surfaces.** A launch page is a durable citable artifact.
5. **Wikipedia-adjacent and structured sources.** Only if genuinely notable. Do not attempt.

For each surface, the deliverable is the same: a factual 40 to 60 word description that matches
`public/llms.txt` word for word where possible, so every source agrees.

## 6. Consistency of the entity description

Answer engines reconcile descriptions across sources. Contradictions cost you the citation.

Keep one canonical sentence and reuse it everywhere: the landing meta description, `llms.txt`,
the `WebApplication` schema `description`, every directory listing, every roundup pitch.

Canonical sentence today:
> Become is a free web app for logging workouts, meals, mood, and weight, built around coach Jon
> Don. It runs in the browser and installs as a PWA. Sign-in is an email magic link.

When the product changes, change it in `marketing/.agents/become-context.md` first, then
propagate. See `become-context`.

## 7. Measuring GEO

There is no rank tracker for this. Measure it as demand, not as sessions. Coordinate with
`analytics-tracking`.

| Signal | How to read it |
|---|---|
| Referrals from `chatgpt.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com` | Small absolute numbers are normal. Direction over months is the signal. |
| Branded search volume in Search Console | The clearest proxy for "an assistant recommended us." |
| Direct traffic with no campaign | Rises when people are told a name and type it. |
| Manual answer audits | Every month, run the ten T1 queries in ChatGPT, Perplexity, and Google AI Mode. Record whether Become is named and which source it was pulled from. That source list is next month's outreach list. |

Log the audit as a dated table in the plan. Ten queries times four engines is a 20 minute job and
it is the only direct read available.

## 8. The honesty constraint applies doubly here

An assistant repeating a claim gives it a credibility we did not earn. So:

- No results claims, no user counts, no testimonials, no pricing that does not exist, anywhere an
  engine can read it. If we write "trusted by thousands," an assistant will repeat it as fact.
- Every statistic on our pages is attributed to its real source, not to us.
- Every capability listed is in the product-truth list. An assistant that tells a user Become
  does something it does not do produces a churned signup and a support burden.
- "Free today" is the only permitted price statement. See `offer-design`.
