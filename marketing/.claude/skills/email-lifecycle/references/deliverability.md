# Deliverability Under Nodemailer SMTP

Become sends through Nodemailer over SMTP (`webapp/lib/email.ts`), with host, port, user, pass,
and from resolved at runtime. There is no ESP dashboard, no seed-list tooling, no automated
warmup, and no suppression list service. Conservative structure is the entire strategy.

**Never write a credential, host value, or connection string into a skill file, a reference
file, or generated output.** Refer to the mechanism, never the value.

---

## The pre-send checklist

Run every item before any send that reaches more than one address.

### Authentication and identity
- [ ] SPF, DKIM, and DMARC pass for the sending domain. Verify by sending one test to an
      external address and reading the received headers. If DKIM does not sign, stop.
- [ ] From-name is stable (`Become`, or `Jon at Become` for coach-signed sends).
- [ ] Reply-to is a real, monitored mailbox. A no-reply reply-to hurts engagement signals and
      annoys people with a genuine question.
- [ ] Transactional and marketing use clearly distinct subjects and, where possible, distinct
      from-names, so a marketing complaint does not poison the login email.

### Structure
- [ ] Single centered column, max width 600px, inline styles, no external stylesheet.
- [ ] Total HTML under roughly 100 KB. Gmail clips beyond that and the clip hides the footer,
      including the unsubscribe link.
- [ ] Image-light. Zero images is fine and often better. Never an image-only email.
- [ ] Every image has alt text that carries the meaning if the image is blocked.
- [ ] One CTA button plus a bare URL line underneath for clients that strip buttons.
- [ ] Plain-text alternative present, or at minimum HTML that degrades to readable text.

### Links
- [ ] All links point at one domain: the app domain for this channel. No URL shorteners, no
      mixed tracking domains.
- [ ] Request-triggered emails derive their host from the request origin (`getRequestOrigin`), so
      a beta signup gets a beta link with nothing configured. Cron-triggered sends have no request
      to derive from and fall back to `NEXT_PUBLIC_APP_URL`, so set it deliberately per channel.
- [ ] No more than four distinct links in a marketing email. One in a transactional one.

### Consent and compliance

**Blocking today.** None of this exists in the codebase yet: no unsubscribe route, no suppression
model, no `List-Unsubscribe` header. Until it does, **transactional email only.** Every box below
is a build requirement, not a review item.

- [ ] An unsubscribe route that works without a login, in one click, and writes to a suppression
      store that every non-transactional send checks.
- [ ] `List-Unsubscribe` header present, plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
      (RFC 8058), so the inbox's own unsubscribe button works without opening the email.
- [ ] Unsubscribes honoured within **2 days**. CAN-SPAM permits 10; Gmail and Yahoo's bulk-sender
      rules require 2, and 2 is the number to hold.
- [ ] Spam-complaint rate under **0.3%**, target **0.1%**. Above 0.3% and the sending domain
      degrades for transactional mail too, which is how a campaign takes the magic links down.
- [ ] **DMARC alignment**, not merely a DMARC pass. The visible From domain must align with the
      authenticated domain, or the bulk-sender rules count it as a fail.
- [ ] Volume watched against the **5,000 messages per day to Gmail** threshold, which is where the
      full bulk-sender requirement set switches on.
- [ ] Physical mailing address in the footer of marketing sends.
- [ ] Transactional emails carry no marketing content, so they legitimately omit unsubscribe.
- [ ] Suppression honoured across the whole program, not per-sequence.

### Volume
- [ ] Broadcasts go out in batches, not one burst. An unwarmed sender that jumps from a trickle
      of magic links to a full-list blast is the fastest route to the spam folder.
- [ ] No send to an address that has hard-bounced.

---

## Why our list is unusually healthy, and what that obliges

Become's signup is a magic link. Every address on the list has demonstrably received mail and
had a human click a link inside it. There are no typo addresses, no purchased records, no
unconfirmed opt-ins, and no role accounts that never engage.

That is a genuine deliverability advantage, and it is fragile. One guilt-toned blast that draws
complaints damages the same sender that carries the login link. **A spam-folder problem here is
an authentication outage, not a marketing problem.** Treat the marketing program as a tenant on
infrastructure the product depends on.

---

## Diagnosing "our emails don't get opened"

Work the list in order. Stop at the first real finding.

1. **Are they arriving at all?** Send to an external test address on a different provider. Check
   inbox, promotions, and spam. If it is in spam, nothing downstream matters.
2. **Do the headers authenticate?** Read the received headers for SPF, DKIM, DMARC results. A
   soft fail here explains everything.
3. **Is the subject visible on a phone?** Over 60 characters and the noun is gone.
4. **Is the preview text set?** An unset preheader shows HTML noise and reads as broken.
5. **Is the send time sane in the recipient's timezone?** Users have a stored timezone or offset.
   A stored offset is a snapshot that goes stale when daylight saving moves, and it only
   self-corrects when the member opens the app, which the quiet ones do not do. Prefer the IANA
   zone name where present. Same reasoning as `webapp/lib/notifications/cronNotify.ts`.
6. **Is open rate even measurable?** Apple Mail Privacy Protection pre-fetches images and inflates
   opens for a large share of recipients. **Open rate is a directional signal at best. Judge
   lifecycle email on clicks and on the in-app action that follows.**
7. **Is the audience right?** An activation email sent to already-activated users looks like a
   low-open email and is actually a suppression bug.

---

## What we do not do

- No engagement-bait re-permission campaigns ("click here to stay subscribed") on a list this
  small and this consensual.
- No list purchases, appends, or enrichment.
- No open-tracking pixel as a primary metric. Track the click and the resulting app action.
- No sending to an address that unsubscribed, for any reason, including "it's transactional
  this time."
- No testing broadcasts against live member addresses. Beta and production share one database,
  so a beta-triggered send reaches real people. Use a dummy account.

---

## Metrics worth watching

| Metric | Read it as | Caution |
|---|---|---|
| Delivered rate | Sender health | The only number that must stay near 100% |
| Hard bounce rate | List integrity | Should be near zero given magic-link signup |
| Click rate | Real interest | The primary metric for lifecycle email |
| In-app action after click | Whether the email worked | The metric that actually matters |
| Unsubscribe rate | Tone and frequency | A spike after one send names the offending send |
| Complaint rate | Danger | Any sustained complaint rate threatens the login email |
| Open rate | Directional only | Inflated by privacy pre-fetching. Never the sole basis of a decision. |

Define these events with `analytics-tracking` so the email report and the product funnel agree.
Any external benchmark you compare against must carry its tier label and may never be restated
as a Become results claim in public copy.
