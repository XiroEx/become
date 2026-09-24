// Consumer Health Data Privacy Policy for /health-data.
//
// DRAFTED BY AN AI. NOT LEGAL ADVICE. Every `kind: 'todo'` block is a question
// for a lawyer and renders visibly on the page.
//
// WHY THIS IS A SEPARATE DOCUMENT. Washington's My Health My Data Act (RCW
// 19.373) and Nevada's consumer health data law (SB 370, NRS 603A) both apply
// to Become — neither has a size threshold, and weight, mood, injury notes and
// journal entries are "consumer health data" under both — and both require a
// DISTINCT consumer health data privacy policy, prominently linked from the
// home page, rather than a section inside the general Privacy Policy. So this
// is that document: the same facts as the Privacy Policy, restated in the
// shape the two statutes ask for (categories, sources, purposes, sharing, the
// list of recipients, the rights and how to use them, and the appeal path).
//
// Nothing here may say more than the Privacy Policy does. Where the two
// overlap they are kept word-for-word or reference each other, so they cannot
// drift apart.

import {
  AI_PROVIDER,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DELETION_DAYS,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTION,
  LEGAL_PRIMARY_DOMAIN,
  LEGAL_SECONDARY_DOMAIN,
  type LegalDoc,
} from '@/lib/legal'

/** Statutory response window under both laws. Stated once, asserted by test. */
export const HEALTH_DATA_RESPONSE_DAYS = 45

export const HEALTH_DATA: LegalDoc = {
  slug: 'health-data',
  title: 'Consumer Health Data Privacy Policy',
  standfirst:
    'For Washington and Nevada, whose laws treat what you enter into a fitness app as consumer health data. It applies to everyone, wherever you live.',
  sections: [
    {
      id: 'scope',
      heading: '1. Who this policy is for',
      blocks: [
        {
          kind: 'p',
          text: `This policy is published under the Washington My Health My Data Act and the Nevada consumer health data privacy law. It is required to be a separate document from our [Privacy Policy](/privacy), so it is one, but it describes the same practices: nothing here is different from, or in addition to, what the Privacy Policy already says. Where the two say the same thing, the Privacy Policy is referenced rather than repeated.`,
        },
        {
          kind: 'p',
          text: `It applies to consumer health data collected from people who live in Washington or Nevada, and to consumer health data collected in those states. We apply it to every member of Become regardless of where they live, because it is simpler to treat everyone the same way than to treat some people worse.`,
        },
        {
          kind: 'p',
          text: `${LEGAL_ENTITY} is ${LEGAL_ENTITY_DESCRIPTION}, and is the regulated entity responsible for this data. Become runs at ${LEGAL_PRIMARY_DOMAIN} and ${LEGAL_SECONDARY_DOMAIN}, including the installable version you can add to your home screen.`,
        },
      ],
    },

    {
      id: 'what',
      heading: '2. What consumer health data we collect, and why',
      blocks: [
        {
          kind: 'p',
          text: 'Consumer health data is personal information that is linked or reasonably linkable to you and that identifies your past, present or future physical or mental health status. Become is a fitness, nutrition and mindset product, so a good deal of what you put into it qualifies. Everything below is collected for one purpose: to provide the coaching you signed up for. We do not use it for advertising, and we do not sell it.',
        },
        {
          kind: 'dl',
          items: [
            {
              term: 'Body measurements',
              detail:
                'Height, current weight, goal weight, weight history, age or date of birth, and biological sex. Used to calculate your calorie and macronutrient targets, to match you to programs, and to show your progress over time.',
            },
            {
              term: 'Injury and limitation notes',
              detail:
                'Anything you type about injuries, restrictions, or movements and equipment you cannot use. Used so programs and generated sessions can work around them.',
            },
            {
              term: 'Physical activity',
              detail:
                'Workouts logged, sets, reps, load, rest, personal records, session notes, schedules and streaks. Used to run your program, track your progress and time your reminders.',
            },
            {
              term: 'Nutrition',
              detail:
                'Meals and foods logged, portions and macros, meal plans, barcode scans, and photos of meals you scan for an estimate. Used to track your intake against your targets.',
            },
            {
              term: 'Mood and mental wellbeing',
              detail:
                'Mood ratings, journal entries, mindset session progress, non-negotiables, goals and reflections. Used to run the Mind section of the app and to show you your own history.',
            },
            {
              term: 'Sleep',
              detail: 'Sleep entries, if you log them. Used to show them back to you alongside the rest of your day.',
            },
            {
              term: 'Inferences',
              detail:
                'Calorie and macro targets, activity level, suggested training loads and AI estimates of a meal or a session, all derived from the above. Used to personalise the app. They are estimates and are described as such in the [Terms](/terms).',
            },
          ],
        },
        {
          kind: 'p',
          text: 'We do not collect precise geolocation, and we do not collect biometric identifiers such as a faceprint or a fingerprint. A profile photo, if you upload one, is stored as an image and is not analysed to identify you.',
        },
      ],
    },

    {
      id: 'sources',
      heading: '3. Where it comes from',
      blocks: [
        {
          kind: 'ul',
          items: [
            'From you, when you fill in your profile, log a workout, a meal, your weight, your mood or your sleep, write a journal entry, or scan a meal photo. This is the source of almost all of it.',
            'From the app itself, when it derives a target or an estimate from what you entered (the inferences in section 2).',
            'From your device, for your time zone offset and, if you turn them on, push notifications — a browser push subscription in the web app, or a native push token issued by Apple’s or Google’s push service in the App Store or Google Play app. None of that is health data on its own; it is listed so the picture is complete, and section 3 of the [Privacy Policy](/privacy) describes it in full.',
            'Not from Google or Stripe. Signing in with Google gives us your email address, name and profile picture; Stripe gives us the state of a payment. Neither passes us any health data.',
          ],
        },
      ],
    },

    {
      id: 'consent',
      heading: '4. Collection, use and consent',
      blocks: [
        {
          kind: 'p',
          text: 'We collect consumer health data only to the extent necessary to provide the product you asked for. You choose what to enter: you can use Become without injury notes, journal entries, mood ratings or meal photos, though some features will be less useful without them. Entering the data is how you ask for the feature that needs it.',
        },
        {
          kind: 'p',
          text: 'We do not collect or use consumer health data for any purpose that is not described in section 2 without first asking for your separate, affirmative consent. Agreeing to the Terms, dismissing a notice, or continuing to use the app does not count as that consent, and we will not treat it as such.',
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Sharing with the AI provider is a separate, affirmative consent',
          items: [
            `Some of what you enter is shared with an AI provider, **${AI_PROVIDER}**, when you use an AI feature — a meal photo or description, the inputs behind a generated workout (which can include your injury notes), the inputs for a Mind session, and what you write to the coach.`,
            'We ask for that permission on its own, with its own tick and its own record, and **we share nothing until you give it**. It is not bundled into the Terms, it is not implied by using the app, and it is refused on the server for every request from a member who has not given it.',
            'You can withdraw it at any time in **Settings → AI features**, which stops the next request. Section 5 lists the provider, and section 7 of the [Privacy Policy](/privacy) says exactly what is sent.',
          ],
        },
        {
          kind: 'p',
          text: 'We do not sell consumer health data, and we will not do so without a valid authorization signed by you that meets the requirements of the Washington and Nevada laws. We do not use geofencing around any facility that provides health care services, for any purpose.',
        },
      ],
    },

    {
      id: 'sharing',
      heading: '5. What we share, and with whom',
      blocks: [
        {
          kind: 'p',
          text: '**We do not share consumer health data with anyone for their own purposes.** We use a small number of service providers, who process it on our written instructions, under contract, for the purpose of running Become and for nothing else. The Washington and Nevada laws ask us to list them by category and by name, with a way for you to contact each, so here is the list.',
        },
        {
          kind: 'dl',
          items: [
            {
              term: 'MongoDB Atlas (MongoDB, Inc.) — hosting and database provider',
              detail:
                'Stores every category in section 2. Contact: [mongodb.com/legal/privacy-policy](https://www.mongodb.com/legal/privacy-policy).',
            },
            {
              term: 'The redbtn platform (REDBTN LLC) — hosting, MinIO object storage and AI routing',
              detail:
                'Runs the Become application and the MinIO object storage (S3-compatible) where your photos are kept, and routes AI requests (a meal photo or description, the inputs for a generated workout, which can include your injury notes, and the inputs for a mindset session) to Google Gemini. Contact: [redbtn.io](https://redbtn.io).',
            },
            {
              term: 'Google Gemini (Google LLC) — AI processing',
              detail:
                'Receives only the input for each request that needs an AI estimate, as described in section 7 of the [Privacy Policy](/privacy), and returns the estimate. **Only for members who have given the separate AI consent in section 4** — nothing is sent for anyone who has not, or who has withdrawn it. Contact: [policies.google.com/privacy](https://policies.google.com/privacy).',
            },
            {
              term: 'Stripe, Inc. — payments',
              detail:
                'Receives no consumer health data. Listed so the list is complete: Stripe sees your email address and your payment, nothing about your body, training, food or mood. Contact: [stripe.com/privacy](https://stripe.com/privacy).',
            },
            {
              term: 'Gmail SMTP (Google LLC) — transactional email',
              detail:
                'Sends sign-in links and streak emails. A streak email names the number of days in your streak and nothing else about you. Contact: [policies.google.com/privacy](https://policies.google.com/privacy).',
            },
          ],
        },
        {
          kind: 'p',
          text: `${LEGAL_ENTITY} does not share consumer health data with any affiliate. Beyond the providers above, we disclose it only where the law requires it, such as a valid court order, and we will tell you where we are allowed to; or to a successor in a merger or sale, in which case we will tell you before your data becomes subject to a different policy.`,
        },
        {
          kind: 'todo',
          text: 'Whether REDBTN LLC, which operates the platform Become runs on, is an "affiliate" of Become LLC under RCW 19.373.010 and NRS 603A given the ownership and control of the two companies, and must therefore be disclosed here as an affiliate rather than, or as well as, a processor. Also whether the contact mechanisms listed for each provider satisfy the requirement for "an active email address or other online mechanism" for each third party, and whether the hosting region of the MongoDB Atlas cluster must be named.',
        },
      ],
    },

    {
      id: 'rights',
      heading: '6. Your rights',
      blocks: [
        {
          kind: 'p',
          text: 'If you live in Washington or Nevada, the law gives you the rights below. We extend them to every member.',
        },
        {
          kind: 'ul',
          items: [
            '**To confirm** whether we are collecting, sharing or selling consumer health data about you, and **to access** it, including a list of every third party and affiliate we have shared it with and how to contact them (section 5 is that list).',
            '**To withdraw consent** to our collection or sharing of consumer health data. Sharing with the AI provider has its own switch: **Settings → AI features**, which takes effect on the next request. Otherwise, because we collect it only to provide what you asked for, withdrawing consent for a category means deleting that data or the feature that uses it; for everything, it means deleting your account.',
            `**To have it deleted**, including from our service providers. We delete within ${LEGAL_DELETION_DAYS} days of confirming your request, instruct each provider in section 5 to delete what it holds for us, and tell you when it is done. Copies in routine backups are removed when those backups age out on their normal schedule, within the six months the Washington law allows for archived or backup systems.`,
            '**Not to be discriminated against** for exercising any of these rights. We will never treat you worse, charge you more or give you less because you asked.',
          ],
        },
        {
          kind: 'p',
          text: 'Deletion has a few limits, which are the same ones the [Privacy Policy](/privacy) states in section 13: billing records we are required to keep, entries in the shared food catalogue that other members’ logs already reference (those are separated from you rather than deleted), and anything we must keep to meet a legal obligation or defend a legal claim.',
        },
      ],
    },

    {
      id: 'how',
      heading: '7. How to use them, and how long we take',
      blocks: [
        {
          kind: 'p',
          text: `Email ${LEGAL_CONTACT_EMAIL} from the address on your account and say what you want. Emailing from the account address is how we verify it is you; we will not ask for identity documents unless there is no other way to be sure. An authorised agent may make a request for you if they can show they are authorised, and we will confirm it with you directly.`,
        },
        {
          kind: 'p',
          text: `We answer within ${HEALTH_DATA_RESPONSE_DAYS} days of receiving your request. Where a request is unusually complex or you have made several, the law lets us take up to ${HEALTH_DATA_RESPONSE_DAYS} more days; if we need them, we will tell you within the first ${HEALTH_DATA_RESPONSE_DAYS} and say why. Requests are free of charge.`,
        },
        {
          kind: 'p',
          text: 'You can also stop the emails and notifications we send without making a request at all: push notifications and streak emails are switched off in Settings, and every streak email carries an unsubscribe link.',
        },
      ],
    },

    {
      id: 'appeal',
      heading: '8. If we refuse',
      blocks: [
        {
          kind: 'p',
          text: `If we decline to act on a request, we will tell you why and how to appeal. To appeal, reply to that email, or write to ${LEGAL_CONTACT_EMAIL} with the word "appeal" in the subject line, within a reasonable time. Someone other than the person who made the first decision will look at it, and we will answer in writing within ${HEALTH_DATA_RESPONSE_DAYS} days with what we did or did not do and why.`,
        },
        {
          kind: 'p',
          text: 'If your appeal is denied, you can complain to the Attorney General of your state: for Washington, at [atg.wa.gov/file-complaint](https://www.atg.wa.gov/file-complaint); for Nevada, at [ag.nv.gov](https://ag.nv.gov). We will include those addresses in the answer to your appeal.',
        },
        {
          kind: 'todo',
          text: `The exact response, extension and appeal deadlines under the Nevada law as enacted, and whether they differ from the ${HEALTH_DATA_RESPONSE_DAYS}-day windows stated here for Washington; the retention schedule of routine database backups, so the backup age-out can be stated as a number of days rather than by reference to the six-month statutory ceiling; and whether the "consent" a member gives by entering data satisfies both statutes for every category in section 2, or whether any category requires a separate consent screen.`,
        },
      ],
    },

    {
      id: 'changes',
      heading: '9. Changes and contact',
      blocks: [
        {
          kind: 'p',
          text: 'We may update this policy. The version and the date at the top of this page always show what is current. If a change materially affects how we handle consumer health data, we will tell you by email or in the app before it takes effect, and where the law requires it we will ask for your consent again.',
        },
        {
          kind: 'p',
          text: `Questions about this policy: email ${LEGAL_CONTACT_EMAIL}, or write to us at the address at the bottom of this page. For everything else we collect, and why, see the [Privacy Policy](/privacy).`,
        },
      ],
    },
  ],
}
