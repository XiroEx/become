# Become LLC — Written Information Security Program

**New York SHIELD Act (General Business Law § 899-bb) · data-breach notification (§ 899-aa)**

- **Version:** 1.0 — draft for sign-off
- **Date issued:** 2026-09-23
- **Effective date:** 2026-09-23
- **Next review due:** 2027-09-23
- **Approval status:** Pending — awaiting review and sign-off by George Anthony
- **Prepared by:** Red (agent, `red@redbtn.io`), from the running infrastructure and the code in
  this repository
- **Owner of this document:** the Security Coordinator named in section 3

> **This was drafted by an agent from the real infrastructure. It is not legal advice.** Every
> statement below is either checkable in this repository today or marked
> `[CONFIRM AT SIGN-OFF: Cn]` because only a person with access to a provider account, a contract
> or a physical room can confirm it. Appendix A lists every one of those markers. A marker is an
> open question, not a claim — do not read past one as if it were settled.

## 0. Where this document lives, and how it gets updated

The canonical copy is this file, `SECURITY_PROGRAM.md`, at the root of the `XiroEx/become`
repository. It is linked from `AGENTS.md`, which is the map both principals and every agent read
first, so there is one copy and one history rather than a PDF in two inboxes.

Three consequences that matter:

- **Approval is recorded here, in git.** When George has read and accepted it, the
  `Approval status` line above changes to `Approved by George Anthony on <YYYY-MM-DD>` in a commit.
  The commit — its author, date and diff — is the signature record.
- **Every change is a diff.** There is no "current version" question to answer at an audit: the
  history of this file is the history of the program.
- **A test guards its shape.** `webapp/tests/unit/legal/securityProgram.test.ts` fails the build if
  this document loses a statutory safeguard clause, stops naming the responsible person, stops
  naming where member data lives, loses its dates, or ever carries something that looks like a
  credential.

## 1. Purpose and legal basis

Become LLC (`becomeurbest.com`, the Become app at `become.redbtn.io`) holds the private information
of New York residents, is formed in New York, and sells a subscription to New York consumers.
GBL § 899-bb(2) therefore requires it to "develop, implement and maintain reasonable safeguards to
protect the security, confidentiality and integrity of the private information", and § 899-bb(2)(b)
sets out what a program has to contain: administrative, technical and physical safeguards. This
document is that program.

**Small business.** § 899-bb(1)(c) scales the requirement: a business with fewer than fifty
employees, under $3,000,000 in average gross annual revenue over the last three fiscal years, and
under $5,000,000 in year-end total assets, satisfies § 899-bb(2)(b) with safeguards "appropriate for
the size and complexity of the small business, the nature and scope of the small business's
activities, and the sensitivity of the personal information the small business collects".
Become LLC is a two-principal company formed on August 1, 2026, with no employees and on the order
of sixty member accounts (sixty as of 2026-08-12), so this program is written to that standard — and
it says plainly, in section 12, what it does not yet do. `[CONFIRM AT SIGN-OFF: C2]`

**No safe harbour applies.** § 899-bb(2)(c) deems a business compliant if it is already regulated
under GLBA, HIPAA, HITECH or 23 NYCRR 500. Become is none of those: it is not a financial
institution, not a covered entity or business associate, and not a DFS-regulated entity. Fitness,
nutrition and mood data is *not* HIPAA-protected health information merely by being health-related.
So the § 899-bb(2)(b) program is the obligation, and this is it.

**What counts as private information.** § 899-bb(1)(b) points at § 899-aa(1)(b): a name or other
identifier in combination with a Social Security number, a driver's licence number, an account or
card number (with or without a security code where the number alone permits access), biometric
data, or **a username or email address together with a password or security question and answer that
would permit access to an online account**. Become holds no Social Security numbers, no driver's
licence numbers, no card numbers and no biometric templates. What brings it inside the statute is
the last limb: email addresses that are the account identifier, plus the credential material
described in section 4 (passkey public-key credentials, legacy bcrypt password hashes, and
short-lived sign-in tokens).

**What is covered beyond the statute.** Training, nutrition, body-measurement, sleep and mood data
is not "private information" under § 899-aa(1)(b), but it is consumer health data under
Washington's My Health My Data Act and Nevada SB 370, and it is the most sensitive thing Become
holds. **This program treats it identically to private information.** Nothing here may be read as
protecting the email address and not the mood log. The member-facing description of that data lives
in `/privacy` and `/health-data` (`webapp/lib/legal/`); this document is the internal control side
of the same facts and must not contradict them.

## 2. Scope

**In scope**

| | What |
|---|---|
| Systems | The Become web application (this repository, deployed as the `become` and `become-beta` RedRun workspaces), MongoDB Atlas, the redbtn platform (RedRun containers, MinIO object storage, Redis, the redsecrets store, redAuth, redReward), Google Gemini as reached through the redbtn platform, Stripe, Gmail SMTP, GitHub (`XiroEx/become`), and the domain and DNS |
| Data | Every category in section 4, on any of those systems, and any local copy of it on a principal's laptop or phone |
| People | Both principals, any contractor or agent given credentials, and the agent automation that holds tokens against these systems |
| Devices | Any device holding a live administrative session or a credential for the systems above |

**Out of scope**

- Anything a member does outside Become — Stripe's own checkout pages, Google's sign-in screen, a
  member's own device security.
- REDBTN LLC's wider fleet beyond the hosts and services Become runs on. Become's control over the
  platform is contractual and operational, not architectural; the platform-operator relationship is
  covered in section 10.
- Employment-related records and the company's own financial records, which contain no member data.

## 3. Who is responsible

§ 899-bb(2)(b)(ii)(A)(1) requires the program to designate one or more employees to coordinate it.
It is designated to one named person, because "both of us watch it" is how a control ends up
watched by nobody.

| Role | Person | What they own |
|---|---|---|
| **Security Coordinator** | **George Anthony** — technical operations; operator of the redbtn platform Become runs on | This program: keeping it current, running the annual review, the risk register in section 5, provider-account security and access reviews, the technical and physical safeguards in sections 7 and 8, and command of an incident under section 11 `[CONFIRM AT SIGN-OFF: C1]` |
| **Business owner / data owner** | **Jon Don** — coach, member-facing owner of Become LLC | The decision to collect a category of data at all, member requests (access, correction, deletion) arriving at `info@becomeurbest.com`, member communication during an incident, and the budget for remediation |
| Deputy during an incident | Whichever principal is reachable first | Containment may not wait for the other. The person who acts writes it in the incident record (section 11) and hands command to the Coordinator at the first opportunity |
| Drafting and review support | Red (agent, `red@redbtn.io`) | Drafting, re-deriving this document from the code, and raising a card when the code and this document diverge. **An agent holds no approval authority.** A change to this program is not in force until a principal commits it |

Security contact of record: `info@becomeurbest.com` (the address the Privacy Policy gives members
for privacy requests and vulnerability reports). Both principals read it.

## 4. What we hold, and where it lives

Derived from the Mongoose models in `webapp/models/`, `webapp/lib/runtimeConfig.ts` and the provider
list in the Privacy Policy. Five systems hold member data — **MongoDB Atlas, the redbtn platform,
Google Gemini, Stripe and Gmail** — and nothing else may be added to that list without a change to
this document and to `/privacy`.

| Data | Where it lives | Operator | Notes |
|---|---|---|---|
| Account: email address (the account identifier), display name, role, `authId`, avatar URL, consent record (version, timestamp, age attestation), email preferences | **MongoDB Atlas** — app database `jondonfitdb`, `users` collection | MongoDB, Inc. | The email address is the private-information limb that brings § 899-aa(1)(b) into play |
| Credential material: passkey (WebAuthn) public-key credentials and challenges, Google OAuth bindings, redAuth identities | **MongoDB Atlas** — separate auth database `become_auth`, managed by `@redbtn/redauth` | MongoDB, Inc. | Kept in its own database because redAuth's `users` collection would otherwise collide with Become's (`webapp/lib/redauth.ts`) |
| Legacy password hashes | **MongoDB Atlas** — `users.password` | MongoDB, Inc. | bcrypt, cost 10, from the pre-magic-link era. The password sign-in endpoints are retired and answer `410` (`webapp/lib/legacyAuthGone.ts`). Nothing reads the field; see gap G11 |
| Sign-in tokens: magic-link token (32 random bytes, hex) and session id | **MongoDB Atlas** — `magiclinks` | MongoDB, Inc. | 15-minute lifetime, single use (marked consumed on verification), earlier unused links for the same address invalidated on each new request, and the row deleted by a TTL index (`webapp/models/MagicLink.ts`) |
| Health and training data: profile (age, biological sex, height, current and target weight, experience, equipment, **injury notes**), workout logs, weight and mood history, streaks, sleep, journal and mindset sessions, nutrition and meal logs | **MongoDB Atlas** — `jondonfitdb` | MongoDB, Inc. | Consumer health data. Treated as private information throughout this program |
| Community and sharing: group membership, shared sessions, chat messages | **MongoDB Atlas** — `jondonfitdb` | MongoDB, Inc. | Member-directed disclosure inside the app |
| Billing metadata: Stripe customer id (live and test), subscription id, price id, plan, period dates, payment-failure timestamps, tier | **MongoDB Atlas** — `users.subscription` | MongoDB, Inc. | No card number, no CVC, no bank detail is ever received or stored |
| Card details, payment records, invoices, receipts | **Stripe** | Stripe, Inc. | Collected by Stripe directly as a controller in its own right. Become holds the metadata above and nothing more |
| Uploaded images and video: meal-scan photos, avatars, chat attachments, food-report photos, member-created exercise demos | **The redbtn platform** — MinIO object storage (S3-compatible), single-node and self-hosted on the fleet's private LAN (`webapp/lib/blobStorage.ts`) | REDBTN LLC | Keys are owner-scoped (`scans/<userId>/…`) and served only through `GET /api/blob/**`, which applies the default-deny policy in `webapp/lib/blobAccess.ts` |
| Runtime secrets: the single encrypted `BECOME_RUNTIME_CONFIG` entry (database URIs, JWT secret, SMTP credentials, Stripe keys, S3 keys, AI webhook secret, VAPID keys, cron secret) | **The redbtn platform** — `@redbtn/redsecrets` store on the fleet's private LAN | REDBTN LLC | The deployment receives only two bootstrap values, `REDSECRETS_MONGODB_URI` and `SECRETS_ENCRYPTION_KEY`; production never falls back to application credentials in the environment (`webapp/RUNTIME_SECRETS.md`) |
| AI request state: the input of an in-flight request and its result, plus the short-lived scoped callback token | **The redbtn platform** — Redis run state (~1 hour) and RedRun container memory/logs | REDBTN LLC | Cache and queue only; nothing here is a system of record |
| AI request inputs: a meal photo or description, the inputs for a generated workout (which can include injury notes), the inputs for a mindset session | **Google Gemini**, reached through the redbtn platform | Google LLC | Only what the request needs is sent, and only for a member who has given the separate AI consent (`users.aiConsent`, `webapp/lib/aiConsent.ts`) — refused server-side on every dispatching route, failing closed, and withdrawable in Settings. Assembled server-side (`webapp/lib/ai/userContext.ts`) so a client cannot widen it. Data-use terms: `[CONFIRM AT SIGN-OFF: C9]` |
| Reward and collectible state (no health data) | **The redbtn platform** — separate redReward database | REDBTN LLC | Keyed on the Become `userId` |
| Outbound transactional and engagement email: recipient address, sign-in links, streak notices, receipts | **Gmail** (Google Workspace SMTP) | Google LLC | Sent via Nodemailer over SMTP with STARTTLS/TLS. Sent mail sits in the sending mailbox |
| Push subscriptions, including the native push token of an App Store / Google Play installation | **MongoDB Atlas** — `jondonfitdb`; delivery via the browser vendor's push service, or via Apple's and Google's push services for a native token | MongoDB, Inc. / vendor | VAPID keys live in redsecrets. The native token addresses one installation, not a person, and is described to members in section 3 of `/privacy` |
| Source code, this program, operational documentation, CI secrets | **GitHub** — `XiroEx/become` (private) | GitHub, Inc. | No member data. Holds credentials for CI (private registry auth, cron secret) |
| Local working copies: a principal's laptop with a repo clone, a live admin session, a database client | Principal devices | Become LLC | The least-controlled surface in the whole inventory. See R11 |

Atlas cluster tier, region, network access list and backup configuration:
`[CONFIRM AT SIGN-OFF: C5]`. Physical siting of the fleet host that runs the platform, MinIO and the
secret store: `[CONFIRM AT SIGN-OFF: C6]`.

## 5. Risk assessment

§ 899-bb(2)(b)(ii)(A)(2) and (3) require the reasonably foreseeable internal and external risks to
be identified and the sufficiency of the safeguards against them to be assessed. Assessed
2026-09-23. Residual is the rating *after* the controls in the same row.

| # | Risk | Controls in place today | Residual |
|---|---|---|---|
| R1 | **Compromise of a provider account** (Atlas, Stripe, the Google account, GitHub, the registrar). One account is full access to member data | Small number of accounts; credentials in a password manager and nowhere else; application credentials are not readable from the deployment environment (they come from redsecrets) | **High impact, low-moderate likelihood.** Depends entirely on MFA being on everywhere: `[CONFIRM AT SIGN-OFF: C3]` |
| R2 | **A secret reaches git, a log or a message.** This has already happened once: a Gmail app password was committed in a tracked `.env` (`AUDIT.md`, 2026-03-04) | `.env` gitignored, `.env.example` with placeholders; single encrypted redsecrets entry; the written credential rule in the operational docs ("never write a password, token, connection string or 2FA seed into any file, commit, log or message"); the unit test on this document rejects credential-shaped strings | Moderate. Rotation of the exposed password is unconfirmed: `[CONFIRM AT SIGN-OFF: C8]`. No automated secret scanning (G10) |
| R3 | **One member's data served to another** — a route without an ownership check, a token used where it should not be, an object fetched by guessing a key | `verifyAuth()` on every data route; ownership checks per resource; `lib/blobAccess.ts` derives the owner from the object key and **defaults to deny** on an unrecognised prefix; scoped AI tokens are rejected by every route that did not opt in; admin is confirmed against the database, never from a token claim; CI runs the unit suite on every PR | Moderate impact, low likelihood. Best-tested area of the system |
| R4 | **Abuse of the unauthenticated sign-in endpoint** — email bombing a third party, or enumerating members | 30-second per-email cooldown on `POST /api/auth/send-link`; magic links are single-use, 15-minute, TTL-deleted; passwordless, so there is no password to guess | Moderate. No general rate limiting anywhere else (G2) |
| R5 | **AI processing carries more than the request needs** to a third party | Request context is assembled server-side and is deliberately compact; inputs are sanitised (`lib/ai/sanitize.ts`); the callback token is scoped and lives 15 minutes; run state expires in about an hour | Moderate, pending C9 |
| R6 | **Destruction or corruption of member data** — a maintenance script run against production, or ransomware on the fleet host | Maintenance scripts in `webapp/scripts/` default to dry-run; `webapp/tests/unit/_guard.ts` refuses to run the unit suite against anything but a loopback `*-test` database; Atlas keeps managed backups | **High impact.** Restore has never been rehearsed (G4), backup configuration unconfirmed (C5) |
| R7 | **Physical compromise of the fleet host** holding member photos and the secret store | Private LAN, not a public object-storage endpoint; premises access `[CONFIRM AT SIGN-OFF: C6]` | High impact, low likelihood. Full-disk encryption unconfirmed (C6) |
| R8 | **Access broader than the job** — both principals and the agent automation can reach live member data; `role: 'admin'` bypasses every entitlement gate | Two principals only; admin role held by a very small number of rows; admin verified server-side against the database | Moderate. No access review cadence (G5), no audit trail of admin reads (G6), and who holds admin is not written down `[CONFIRM AT SIGN-OFF: C4]` |
| R9 | **Beta and production share one MongoDB**, so code on beta reads and writes live member data | Deliberate and documented in `AGENTS.md`; the billing mode fence stops test-mode Stripe events overwriting live subscription state | Accepted, with eyes open. Beta is a code preview, never a data sandbox, and must never be treated as one |
| R10 | **A breach at a processor** (MongoDB, REDBTN, Google, Stripe) | Established providers; § 899-aa(2) makes their notice to us the trigger for our notice to members; contract terms `[CONFIRM AT SIGN-OFF: C7]` | Moderate. Our obligation to members survives regardless of whose systems failed |
| R11 | **A principal's device or session is compromised** while holding a live admin session | Password manager; sessions are cookie-bound and HttpOnly | **Moderate-high.** Sessions last 30 days and slide on use, and there is no way to revoke one device (G7) |
| R12 | **Phishing or social engineering of a principal**, including a support request impersonating a member | Member requests are answered only from the address on the account (Privacy Policy §12); no member data is sent to any other address | Moderate. No formal training record beyond this document (G9) |

## 6. Administrative safeguards — GBL § 899-bb(2)(b)(ii)(A)

**(A)(1) Designates one or more employees to coordinate the security program.**
Section 3: George Anthony is the Security Coordinator; Jon Don is the business/data owner. Named in
one place, in a document with a history.

**(A)(2) Identifies reasonably foreseeable internal and external risks.**
The register in section 5, covering both: internal (R6, R8, R9, R11, R12) and external (R1, R2, R3,
R4, R5, R7, R10). Re-derived at each review in section 13, and immediately on any material change to
the systems in section 4.

**(A)(3) Assesses the sufficiency of safeguards in place to control the identified risks.**
Each row in section 5 carries its controls and a residual rating; anything not sufficiently
controlled becomes a numbered gap in section 12 with an owner and a target date. A gap stated here
is the assessment, not an admission that the assessment was skipped.

**(A)(4) Trains and manages employees in the security program practices and procedures.**
There are no employees; there are two principals and agent automation.
- Both principals read this document at sign-off and at every annual review, and record it in the
  table in section 13.
- The standing credential rule applies to everyone, human or agent: **never write a password,
  token, recovery code, connection string or 2FA seed into any file, commit, log or message.**
  Placeholders only; real values live in the password manager.
- Anyone given access — contractor or agent — is pointed at this document and the credential rule
  before a credential is issued, and their access is recorded for the review in (A)(5).
- Agents may draft and propose; only a principal approves and merges. Agent credentials are scoped
  to the job and are listed in the access review.

**(A)(5) Selects service providers capable of maintaining appropriate safeguards, and requires
those safeguards by contract.**
The list is section 4 and section 10, deliberately short. Each provider is selected for being a
managed service with a published security posture, except the redbtn platform, which is
self-hosted by the Coordinator and therefore governed by this document directly. Whether written
data-processing terms are in place with each: `[CONFIRM AT SIGN-OFF: C7]` — the same open question
the Privacy Policy and the Consumer Health Data Policy already flag to members, tracked as G8. No
new provider touches member data until it appears in section 4, in `/privacy`, and — where it
receives consumer health data — in `/health-data`.

**(A)(6) Adjusts the security program in light of business changes or new circumstances.**
Section 13 sets the review cadence and the triggers. A change to the systems in section 4, a new
provider, an incident, or a new data category is a trigger, not a note for next year.

## 7. Technical safeguards — GBL § 899-bb(2)(b)(ii)(B)

**(B)(1) Assesses risks in network and software design.**
- **Passwordless by design.** Magic link, passkey (WebAuthn) or Google. Legacy password endpoints
  answer `410`. There is no password of the member's for an attacker to steal, guess or reuse.
- **Sessions.** HS256 JWT, 30-day sliding expiry, delivered in an `HttpOnly`, `SameSite=Lax`
  cookie, `Secure` in production, and also accepted as a bearer token for the native client.
  Non-session tokens carry a `scope` claim and are **default-denied**: a scoped token is rejected by
  every route that did not name that exact scope.
- **Authorisation is server-side, always.** Middleware only checks that a cookie is present; every
  route re-verifies. Admin is confirmed by reading the user row, never from a token claim. Binary
  objects are authorised from the object key, with an unrecognised prefix treated as owner-scoped.
- **Secrets are not in the deployment environment.** One encrypted redsecrets entry, two bootstrap
  values, no fallback to insecure defaults in production.
- **Change control.** Every change is a pull request into `beta` and then `main`; CI runs typecheck,
  the unit suite and a production build on each one. Nobody commits to `main` directly.
- Reviewed against the design: no CSP, HSTS or `X-Frame-Options` headers are set today (G1), and
  there is no general rate limiting (G2).

**(B)(2) Assesses risks in information processing, transmission and storage.**
- **In transit:** HTTPS to the app, TLS to Atlas, TLS/STARTTLS to Gmail SMTP, HTTPS to Stripe and to
  the platform's AI endpoint. Object storage is reached over the private LAN and is never exposed
  directly to members — reads go through the authorising proxy route.
- **At rest:** Atlas applies its managed encryption at rest to the cluster (MongoDB-managed keys; no
  customer-managed key is configured). The redsecrets entry is encrypted with a key held outside the
  store. Object storage sits on a local disk whose encryption status is `[CONFIRM AT SIGN-OFF: C6]`.
- **In processing:** AI request payloads are assembled server-side and kept to what the request
  needs; run state expires in about an hour; the callback token lives 15 minutes and is scope-fenced.
- **Minimisation:** card data is never received; the sign-up form asks for an email address and
  nothing else; every other field is volunteered by the member for a feature they chose to use.

**(B)(3) Detects, prevents and responds to attacks or system failures.**
- *Prevents:* everything in (B)(1), plus the send-link cooldown and single-use short-lived links, the
  billing mode fence, and the duplicate-event guard on the billing webhook.
- *Detects:* CI failure on every PR; RedRun container logs and build state; Stripe's own dashboard
  for payment anomalies; Atlas metrics and alerting `[CONFIRM AT SIGN-OFF: C5]`; members and the
  principals as reporters, via `info@becomeurbest.com`. **This is the weakest link in the program:
  no centralised logging, no alerting and no error monitoring, so nothing tells us an attack is in
  progress (G3).** It is stated plainly rather than dressed up.
- *Responds:* section 11.

**(B)(4) Regularly tests and monitors the effectiveness of key controls, systems and procedures.**
- The unit suite runs on every pull request and on every push to `beta` and `main`, and it includes
  tests that exist purely as controls: the object-storage access policy, token scoping, entitlement
  enforcement coverage, the billing mode fence, and the loopback-only database guard.
- This document is itself tested (`webapp/tests/unit/legal/securityProgram.test.ts`).
- At each annual review the Coordinator re-walks section 4 against the code and the provider
  consoles, re-rates section 5, and records the result in section 13.
- Not yet done: a rehearsed restore from backup (G4), a periodic access review (G5), and any
  external test or scan (G12).

## 8. Physical safeguards — GBL § 899-bb(2)(b)(ii)(C)

Become has no office and no server room of its own. The physical surface is therefore small and
specific: the fleet host that runs the redbtn platform, and the principals' own devices.

**(C)(1) Assesses risks of information storage and disposal.**
- Member photos and video, the Redis run state and the redsecrets store sit on the **self-hosted
  fleet host on a private LAN**, operated by the Coordinator. Its physical location, who can reach
  it, and whether its disks are encrypted are `[CONFIRM AT SIGN-OFF: C6]` — and until that is
  answered, theft of that machine is the single largest physical risk to member data (R7).
- Everything else is in a managed provider's data centre (Atlas, Stripe, Google, GitHub), whose
  physical controls are the provider's and are relied on as such.
- Principal devices hold repo clones, live sessions and occasional exports. They are the mobile,
  losable part of the estate.
- No paper records of member data exist, and none may be created.

**(C)(2) Detects, prevents and responds to intrusions.**
- Object storage and the secret store are not published to the internet; they are reachable on the
  private LAN only.
- Managed providers are reached over the internet with account credentials and MFA
  `[CONFIRM AT SIGN-OFF: C3]`.
- Physical intrusion detection at the premises housing the fleet host, and device-level controls
  (lock screen, full-disk encryption, remote wipe) on principal devices, are
  `[CONFIRM AT SIGN-OFF: C6]` and `[CONFIRM AT SIGN-OFF: C10]`.
- A lost or stolen device, or a machine believed to be tampered with, is an incident under section
  11: credentials that device could reach are rotated and sessions minted from it are treated as
  compromised.

**(C)(3) Protects against unauthorised access to or use of private information during or after
collection, transportation and destruction or disposal.**
- *Collection:* over HTTPS, into the systems in section 4, and nowhere else. No member data is
  collected into a spreadsheet, a DM or a notes app.
- *Transportation:* exports and database dumps are made only when a specific task needs one, are
  kept on an encrypted device, are never attached to email or posted into chat, and are deleted when
  the task is done. A dump is member data with every access control stripped off.
- *Disposal:* section 9.

**(C)(4) Disposes of private information within a reasonable amount of time after it is no longer
needed for business purposes, by erasing electronic media so that the information cannot be read or
reconstructed.**
See section 9. Physically: a drive that held member data is not sold, donated or thrown out — it is
cryptographically erased or destroyed, and the disposal is recorded by the Coordinator.

## 9. Retention and disposal

| Data | Kept | Disposal |
|---|---|---|
| Magic-link tokens and session ids | 15 minutes | Deleted automatically by the MongoDB TTL index — disposal implemented as a property of the collection, not as a chore |
| AI run state | About an hour | Redis expiry |
| Account, health, training, nutrition and community data | While the account exists | Deleted on request within 30 days (Privacy Policy §13). There is no in-app delete button yet (G8); today it is a request to `info@becomeurbest.com` from the account address, and the Coordinator runs the deletion across the app database, the auth database and object storage |
| Uploaded images and video | While the account exists, or until the member deletes the item | Deleted from object storage as part of the same deletion |
| Legacy password hashes | Retained today, needed by nothing | Should be dropped (G11) |
| Billing records | As long as tax and accounting law requires | Stripe keeps its own records; Become keeps the minimum metadata |
| Email in the sending mailbox | Sent transactional mail accumulates in the Gmail mailbox | Not currently pruned (G13) |
| Local exports and dumps | For the life of the task only | Deleted, from the trash too, when the task ends |
| Drives and devices that held member data | — | Cryptographically erased or destroyed before disposal or reuse; recorded by the Coordinator |

## 10. Service providers

| Provider | What it does for Become | Sees health data | Contract / terms |
|---|---|---|---|
| MongoDB, Inc. (MongoDB Atlas) | Managed database for the app and auth databases | Yes | Atlas terms of service. Written processing terms: `[CONFIRM AT SIGN-OFF: C7]` |
| REDBTN LLC (the redbtn platform) | Hosting (RedRun), MinIO object storage, Redis, the secret store, and routing AI requests to Gemini | Yes | Operated by the Security Coordinator, and therefore inside this program. Whether REDBTN LLC is an *affiliate* of Become LLC rather than a processor is an open question already flagged in `/health-data`; `[CONFIRM AT SIGN-OFF: C7]` |
| Google LLC (Gemini, via the platform) | AI estimation for meal scans, workout generation and mindset sessions | Yes, for the input of each request | `[CONFIRM AT SIGN-OFF: C9]` — including whether inputs may be used for model training |
| Stripe, Inc. | Payments, subscriptions, the billing portal | No | Stripe Services Agreement; Stripe is a controller for card data in its own right |
| Google LLC (Gmail SMTP) | Transactional and engagement email | Only incidentally — a streak email names a number of days | Google Workspace terms. `[CONFIRM AT SIGN-OFF: C7]` |
| GitHub, Inc. | Private source repository and CI | No member data | GitHub terms |

Provider security is not assumed: each is selected as a managed service with published controls, and
the list is reviewed annually with this document. A provider that suffers a breach affecting Become
members triggers section 11 on our side, with our own notification duty under § 899-aa — their
incident does not discharge our obligation to the people whose data it is.

## 11. Incident response and breach notification (GBL § 899-aa)

A response invented during an incident is not a response. This is the plan; that it has not been
rehearsed yet is gap G12, and rehearsing it is how this section stops being theory.

**What is an incident.** Any suspected unauthorised access to, acquisition of, use of or disclosure
of member data or a credential that reaches it: a leaked secret, a lost or stolen device, an
unexplained admin action, a provider's breach notice, a member reporting someone else's data on
their screen, or a vulnerability report.

**Who runs it.** The Security Coordinator, or whichever principal is reachable first if containment
cannot wait (section 3).

1. **Record it.** Open a dated incident record — a card on the board and, if member data is
   involved, a file under this document's history. What was seen, when, by whom. From this point
   every step is written down as it happens, not reconstructed later.
2. **Contain, within the hour if possible.** Rotate the affected credential in redsecrets; revoke
   provider sessions and API keys; if a JWT secret is suspect, rotate it (which invalidates every
   session); restrict the Atlas network access list; take the affected surface offline in preference
   to leaving it exposed.
3. **Preserve evidence.** Copy container and provider logs before anything is redeployed or a
   container is recycled. A redeploy loses the logs.
4. **Assess scope.** Which data categories from section 4, how many members, how many are **New York
   residents**, what was actually accessed versus merely reachable. Under § 899-aa(1)(c), "breach"
   includes unauthorised *access*, not only acquisition — indications of access, such as an
   unexplained read of a file or record, count.
5. **Decide on notification.** If private information of a New York resident was accessed or
   acquired without authorisation:
   - **Notify the affected residents** in the most expedient time possible and without unreasonable
     delay, by written or electronic notice (email to the address on the account, with an in-app
     notice), consistent with the needs of law enforcement. Content per § 899-aa(2): what happened,
     the categories of information involved, and contact information for us, plus the telephone
     numbers and websites of the state and federal agencies that advise on identity-theft
     protection.
   - **Notify the State**, without delaying consumer notice: the **Attorney General**, the
     **Department of State Division of Consumer Protection**, and the **Division of State Police**,
     with the timing, content and distribution of the notices and the approximate number of
     affected persons.
   - If more than **5,000** New York residents are notified at once, also notify the **consumer
     reporting agencies** as § 899-aa(2) requires.
   - **The inadvertent-disclosure exception is narrow and must be documented.** If the exposure was
     an inadvertent disclosure by a person authorised to access the information and we reasonably
     determine it is unlikely to result in misuse or financial or emotional harm, notice may be
     withheld — but the determination must be **in writing, kept for five years**, and if it
     involves more than **500** New York residents, a written determination must go to the Attorney
     General **within ten days**.
   - Other states' laws and other obligations are considered in the same assessment: consumer
     health data rules for Washington and Nevada members, other states' breach statutes, and
     Stripe's and the platform's own notification requirements. Where the facts are close to the
     line, counsel is retained before the notification decision, not after.
6. **Notify members honestly.** Jon Don owns the member-facing message: what happened, what we know,
   what we do not know yet, what we are doing, what they should do. No minimising, and no waiting
   for a complete picture before saying anything to people whose data it is.
7. **Close it out.** Within two weeks of containment: root cause, what control should have caught
   it, a numbered gap added to section 12 with an owner and a date, and — if the program itself was
   inadequate — a revision to this document at the same time.

**Vulnerability reports** to `info@becomeurbest.com` are acknowledged and triaged like an incident
until shown to be harmless. The Privacy Policy asks finders to report before disclosing publicly;
this is the side of that promise we owe them.

## 12. Known gaps and remediation

Written down because an undocumented gap is an unmanaged one. Owner "Coordinator" is George Anthony;
"Business owner" is Jon Don. Target dates are proposed by this draft and are fixed at sign-off.

| # | Gap | Risk | Owner | Target |
|---|---|---|---|---|
| G1 | No security response headers: no CSP, HSTS, `X-Frame-Options` or `Referrer-Policy`. `next.config.ts` sets caching and video CORS only | R3 | Coordinator | 2026-10-31 |
| G2 | No general rate limiting on API routes; the only throttle anywhere is the 30-second send-link cooldown | R4 | Coordinator | 2026-11-30 |
| G3 | No centralised logging, alerting or error monitoring. Nothing would tell us an attack or a mass export was under way | R1, R8 | Coordinator | 2026-11-30 |
| G4 | Backups never rehearsed: no documented schedule, retention or tested restore | R6 | Coordinator | 2026-10-31 |
| G5 | No periodic access review and no written record of who holds admin on each provider account and in the app | R8 | Coordinator | At sign-off, then quarterly |
| G6 | No audit trail of administrative access to member data | R8 | Coordinator | 2027-01-31 |
| G7 | Sessions last 30 days and slide on use, with no way to revoke a single session or device | R11 | Coordinator | 2027-01-31 |
| G8 | Processor terms unconfirmed (C7), and no in-app account deletion — deletion is a manual request handled within 30 days | R10 | Business owner | 2026-12-31 |
| G9 | No training record beyond the sign-off table in section 13 | R12 | Business owner | At sign-off |
| G10 | No automated secret scanning on the repository, after a credential was committed once already | R2 | Coordinator | 2026-11-30 |
| G11 | Legacy bcrypt password hashes retained although nothing reads them | R1 | Coordinator | 2026-12-31 |
| G12 | No external vulnerability scan or penetration test, and no rehearsal of section 11 | R1, R3 | Coordinator | 2027-03-31 |
| G13 | Sent transactional email accumulates in the Gmail mailbox with no retention limit | R1 | Business owner | 2026-12-31 |

## 13. Review, revision and approval

**Cadence.** Reviewed at least annually. This edition is effective **2026-09-23**; the next review
is due **2027-09-23**. The review is a card on the board, not a memory.

**Triggers that force a review before the due date** — § 899-bb(2)(b)(ii)(A)(6):

- a new provider, or a provider dropped, or a new system in section 4;
- a new category of member data, or a new use of an existing category;
- any incident under section 11, or a vulnerability report that turns out to be real;
- a change of personnel, or a new contractor or agent given credentials;
- a material change to authentication, authorisation, hosting or the secret store;
- a change in law that reaches Become: an amendment to § 899-bb or § 899-aa, or a new state privacy
  or consumer-health-data statute that applies to members.

**What a review does.** Re-walk section 4 against the code and the provider consoles; re-rate
section 5; close or re-date every gap in section 12; confirm the Appendix A items are still true;
record the result below.

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-09-23 | Red (agent) | First written program. Drafted from the running infrastructure and this repository for go-live audit item 17 |

**Approval and acknowledgement**

Approval is recorded by editing the `Approval status` line at the top of this file and this table in
a commit. The commit is the signature.

| Role | Name | Acknowledged / approved | Date |
|---|---|---|---|
| Security Coordinator (approves) | George Anthony | Pending | — |
| Business owner (acknowledges) | Jon Don | Pending | — |

## Appendix A — confirm at sign-off

Each item is a fact this program depends on that an agent cannot verify from inside the repository.
Answer it in the same commit that approves the document; where the answer is "no", open a numbered
gap in section 12 instead of deleting the line.

| Id | To confirm |
|---|---|
| C1 | That George Anthony accepts designation as Security Coordinator, and that the name, role and security contact address in section 3 are correct |
| C2 | That Become LLC meets the § 899-bb(1)(c) small-business definition: fewer than fifty employees, under $3,000,000 average gross annual revenue over the last three fiscal years, and under $5,000,000 in year-end total assets |
| C3 | That multi-factor authentication is enabled on every account that can reach member data — MongoDB Atlas, Stripe, the Google/Workspace account behind Gmail SMTP, GitHub, the domain registrar and the platform console — and that recovery codes are in the password manager and nowhere else |
| C4 | Who holds administrative access to each provider account, and the full list of `role: 'admin'` users in production, written down for the access review (G5) |
| C5 | MongoDB Atlas configuration: cluster tier and region, the IP access list, whether database-level auditing is available on the tier, the backup schedule and retention, and whether a restore has ever been tested |
| C6 | The fleet host running the redbtn platform, MinIO object storage and the secret store: its physical location, who has physical access to that space, whether its disks are encrypted at rest, and how a failed or replaced drive is destroyed |
| C7 | Whether written data-processing terms committing to appropriate safeguards are in place with MongoDB, Inc., REDBTN LLC, Google LLC (Gemini and Workspace) and Stripe, Inc. — the same question `/privacy` and `/health-data` already flag to members — and whether REDBTN LLC is an affiliate of Become LLC rather than a processor |
| C8 | Whether the Gmail app password that was committed to git history (`AUDIT.md`, 2026-03-04) was in fact rotated, and whether any other credential in that history is still live |
| C9 | Google Gemini's data-use terms for the platform account Become dispatches through: whether member inputs can be used to train models, and what retention applies on Google's side |
| C10 | Device controls on the principals' laptops and phones: full-disk encryption, lock screen, remote wipe, and who else can unlock them |
