// Privacy Policy for /privacy.
//
// DRAFTED BY AN AI. NOT LEGAL ADVICE. Every `kind: 'todo'` block is a question
// for a lawyer and renders visibly on the page.
//
// The parts that are easy to get wrong, and are deliberately not:
//   • The processor list names only the five processors Become ACTUALLY uses.
//     A generic "we may share with analytics and advertising partners" line
//     would be a false statement about a product that has neither.
//   • Health-adjacent data is called what it is, and the "not a HIPAA covered
//     entity" point is stated plainly rather than left for a member to assume
//     either way.
//   • The deletion section describes the process that EXISTS TODAY, which is an
//     email to support, because there is no member-facing deletion route in the
//     app yet. Describing a button that is not there would be the one lie in
//     this document that Apple would actually test.

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DELETION_DAYS,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTION,
  LEGAL_PRIMARY_DOMAIN,
  LEGAL_SECONDARY_DOMAIN,
  type LegalDoc,
} from '@/lib/legal'

export const PRIVACY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  standfirst:
    'What Become collects, why, who else touches it, how long we keep it, and how to get it back or get rid of it.',
  sections: [
    {
      id: 'summary',
      heading: '1. The short version',
      blocks: [
        {
          kind: 'callout',
          tone: 'info',
          title: 'In plain language',
          items: [
            'Become collects what it needs to coach you: your email address, your body stats, what you train, what you eat, how you feel, and photos you take of your meals.',
            'We do not sell your personal information, we do not share it for advertising, and there are no third-party ad trackers in the app.',
            'A small number of named service providers process data for us. They are listed in section 8, and there are five of them.',
            'We never see your card number. Stripe handles payment.',
            'You can ask for a copy of your data, ask us to correct it, or ask us to delete your account. Section 12 says how, and section 13 is honest about the fact that deletion is an email today rather than a button in the app.',
          ],
        },
      ],
    },

    {
      id: 'who',
      heading: '2. Who we are, and what this covers',
      blocks: [
        {
          kind: 'p',
          text: `${LEGAL_ENTITY} is ${LEGAL_ENTITY_DESCRIPTION}, and is the controller of the personal information described here. This policy covers the Become app and website at ${LEGAL_PRIMARY_DOMAIN} and ${LEGAL_SECONDARY_DOMAIN}, including the installable version you can add to your home screen.`,
        },
        {
          kind: 'p',
          text: 'It does not cover anything you reach by leaving Become, such as Stripe’s own checkout pages or Google’s sign-in screen. Those are governed by their own policies.',
        },
      ],
    },

    {
      id: 'collect',
      heading: '3. What we collect',
      blocks: [
        {
          kind: 'dl',
          items: [
            {
              term: 'Account',
              detail:
                'Your email address, your name, which sign-in method you use, the public key and identifiers for any passkey you register, and the session token that keeps you signed in. We do not store a password for magic-link, Google or passkey sign-in.',
            },
            {
              term: 'Profile and body data',
              detail:
                'Height, current weight, goal weight, age or date of birth, biological sex, experience level, training days per week, available equipment, and your unit preferences. These set your training and nutrition targets, and the calculations do not work without them.',
            },
            {
              term: 'Injury and limitation notes',
              detail:
                'Anything you type about injuries, restrictions, or movements and equipment you cannot use, so programs and generated sessions can work around them.',
            },
            {
              term: 'Training data',
              detail:
                'Workouts logged, sets, reps, load, rest, personal records, session notes, your schedule, streaks, and any custom exercises, sessions and programs you build.',
            },
            {
              term: 'Nutrition data',
              detail:
                'Meals and foods logged, portions and macros, custom foods, meals and recipes, meal plans, barcode scans, and the photos of meals you scan.',
            },
            {
              term: 'Mind and mood data',
              detail:
                'Mood ratings, journal entries, mindset session progress, non-negotiables, goals and reflections.',
            },
            {
              term: 'Photos and images',
              detail:
                'Meal photos, profile and progress photos, and images you attach to programs, recipes or custom exercises.',
            },
            {
              term: 'Device and notification data',
              detail:
                'Your browser push subscription (an endpoint and keys, if you turn notifications on), your time zone offset, your device and browser type, and your in-app settings.',
            },
            {
              term: 'Usage and diagnostic data',
              detail:
                'Which features you use, how much of an AI allowance you have used, error and diagnostic logs, and the IP address and timestamps recorded in server logs.',
            },
            {
              term: 'Payment metadata',
              detail:
                '**Become never sees, receives or stores your card number, CVC or bank details. Stripe does.** What we hold is your Stripe customer identifier, your plan and subscription status, your billing period dates, and whether each charge succeeded or failed.',
            },
            {
              term: 'Communications',
              detail:
                'Emails you send us, in-app feedback you submit, and anything you post to a community group or event.',
            },
          ],
        },
      ],
    },

    {
      id: 'sources',
      heading: '4. Where it comes from',
      blocks: [
        {
          kind: 'ul',
          items: [
            'From you, when you sign up, fill in your profile, log a workout or a meal, write a journal entry, or take a photo.',
            'From your device, for your time zone offset and, if you turn them on, push notifications.',
            'From Google, if you choose to sign in with Google: your email address, your name, your profile picture and a Google account identifier.',
            'From Stripe, for the outcome of a payment and the state of your subscription.',
          ],
        },
      ],
    },

    {
      id: 'why',
      heading: '5. Why we use it, and our legal bases',
      blocks: [
        {
          kind: 'p',
          text: 'The legal bases below are the wording used in the EU and UK GDPR. If you are elsewhere, they still describe honestly why we hold what we hold.',
        },
        {
          kind: 'dl',
          items: [
            {
              term: 'To run the Service',
              detail:
                'Your account, your programs, your logs and your history. Basis: performance of our contract with you.',
            },
            {
              term: 'To personalise targets and recommendations',
              detail:
                'Calorie and macro targets, training load, suggested sessions. Basis: performance of our contract, and, for health-related data in the EU and UK, your explicit consent (see section 6).',
            },
            {
              term: 'To produce AI estimates and generated sessions',
              detail:
                'Only on the input you submit for that request. Basis: performance of our contract.',
            },
            {
              term: 'To take payment and manage subscriptions',
              detail:
                'Basis: performance of our contract, and legal obligation for financial records.',
            },
            {
              term: 'To send transactional email',
              detail:
                'Sign-in links, receipts and account notices. Basis: performance of our contract.',
            },
            {
              term: 'To send push notifications and reminders',
              detail:
                'Only the ones you turn on. Basis: your consent, which you can withdraw in Settings at any time.',
            },
            {
              term: 'To keep the Service secure and stop abuse',
              detail:
                'Rate limits, allowance counting, fraud and abuse signals. Basis: our legitimate interests in a working, non-abused product.',
            },
            {
              term: 'To fix bugs and improve the product',
              detail:
                'Error logs and aggregate feature usage. Basis: our legitimate interests.',
            },
            {
              term: 'To comply with law and defend claims',
              detail: 'Basis: legal obligation, and our legitimate interests.',
            },
          ],
        },
      ],
    },

    {
      id: 'health',
      heading: '6. Health-related data, and HIPAA',
      blocks: [
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Become is not a HIPAA covered entity',
          items: [
            'Become is not a healthcare provider, a health plan or a healthcare clearinghouse, and it is not a business associate of one. **HIPAA does not apply to the data you put into Become.**',
            'That does not mean the data is unprotected. It means the rules that protect it are this policy, our contracts with our processors, and applicable state and international privacy law, rather than HIPAA.',
          ],
        },
        {
          kind: 'p',
          text: 'Weight, body measurements, biological sex, injury notes, mood ratings, journal entries and photos of your meals are personal, and in some places they are treated as sensitive or health-related information. We collect them because the product cannot set your targets or build your program without them.',
        },
        {
          kind: 'p',
          text: 'You decide how much to write. You can use Become without injury notes or journal entries, though some features will be less useful. In the EU and UK, where our basis for this category is your explicit consent, you give that consent by choosing to enter the data, and you can withdraw it by deleting the data or your account.',
        },
      ],
    },

    {
      id: 'ai',
      heading: '7. AI processing',
      blocks: [
        {
          kind: 'p',
          text: 'When you scan a meal, generate a workout or run a mindset session, the input for that request is sent to **Google Gemini**, which Become reaches through the redbtn platform it runs on. Only what the request needs is sent: for a meal scan, the photo or description and the context needed to interpret it.',
        },
        {
          kind: 'p',
          text: 'What comes back is an estimate. The [Terms](/terms) explain what that does and does not mean.',
        },
        {
          kind: 'p',
          text: 'No automated decision in Become produces a legal or similarly significant effect on you. AI output sets suggestions and estimates. It never decides your eligibility, your price or your access.',
        },
        {
          kind: 'todo',
          text: 'Whether Become can state that Google does not use member content submitted through the redbtn platform to train its models, and whether a written data processing agreement covering that is in place with the platform operator and with Google.',
        },
      ],
    },

    {
      id: 'sharing',
      heading: '8. Who we share it with',
      blocks: [
        {
          kind: 'p',
          text: '**We do not sell your personal information, and we do not share it for cross-context behavioural advertising.** We use a small number of service providers, who process data on our instructions and for no purpose of their own except as noted:',
        },
        {
          kind: 'dl',
          items: [
            {
              term: 'MongoDB Atlas',
              detail:
                'The managed database where your account, profile, training, nutrition and mind data is stored.',
            },
            {
              term: 'Stripe',
              detail:
                'Payments and subscriptions. Stripe collects and processes your card details directly, as a controller in its own right and under its own privacy policy. We receive only the metadata listed in section 3.',
            },
            {
              term: 'Google Gemini, reached through the redbtn platform',
              detail:
                'AI estimation of meals, workout generation and mindset composition, on the input for each request. See section 7.',
            },
            {
              term: 'MinIO object storage (S3-compatible)',
              detail: 'Where the photos and images you upload are stored.',
            },
            {
              term: 'Gmail SMTP (Google)',
              detail:
                'Sends transactional email such as sign-in links, receipts and account notices.',
            },
          ],
        },
        { kind: 'p', text: 'Beyond those, we disclose personal information only:' },
        {
          kind: 'ul',
          items: [
            'To Google, if you choose to sign in with Google, which is a disclosure by you rather than by us.',
            'To people you deliberately share with inside the app, such as a community group, an event or a shared session.',
            'Where the law requires it, such as a valid court order or lawful request, and we will tell you where we are allowed to.',
            'To a successor in a merger, acquisition or sale of assets, in which case we will tell you before your information becomes subject to a different policy.',
          ],
        },
        {
          kind: 'todo',
          text: 'Whether a written data processing agreement is signed with each processor above, whether this list must name specific sub-processors and hosting regions, and whether the MongoDB Atlas cluster region needs to be disclosed by name here.',
        },
      ],
    },

    {
      id: 'never',
      heading: '9. What we do not do',
      blocks: [
        {
          kind: 'ul',
          items: [
            'We do not sell your personal information.',
            'We do not share it for cross-context behavioural advertising.',
            'We do not run third-party advertising or advertising trackers in the app.',
            'We do not post anything to your social accounts.',
            'We do not read your journal entries or your injury notes except where you ask us for support and it is necessary to answer you, or where the law requires it.',
          ],
        },
      ],
    },

    {
      id: 'retention',
      heading: '10. How long we keep it',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Account, training, nutrition and mind data: kept while your account exists, so your history stays useful to you.',
            `After a deletion request: removed within ${LEGAL_DELETION_DAYS} days of us confirming it, except for copies sitting in routine backups until those backups age out on their normal schedule.`,
            'Sign-in links: deleted automatically 15 minutes after they are created, whether or not they were used.',
            'Payment records: Stripe keeps its own transaction records for its legal and tax obligations, and we keep the minimum billing metadata we need for accounting.',
            'Server logs: kept only as long as they are useful for diagnosing problems and spotting abuse.',
          ],
        },
        {
          kind: 'todo',
          text: 'The retention period Become must apply to financial and tax records under New York and federal law, and the exact server log retention period once that is fixed in the infrastructure, so both can be stated here as numbers instead of descriptions.',
        },
      ],
    },

    {
      id: 'security',
      heading: '11. Security',
      blocks: [
        {
          kind: 'p',
          text: 'What we actually do, stated without decoration:',
        },
        {
          kind: 'ul',
          items: [
            'Traffic between your device and Become is served over HTTPS.',
            'Sign-in is passwordless, so there is no password of yours to be stolen, guessed or reused somewhere else.',
            'Session tokens are signed and expire.',
            'Card details never reach our servers, because Stripe collects them.',
            'Access to production data is limited to a small number of people who need it.',
          ],
        },
        {
          kind: 'p',
          text: '**We do not hold SOC 2, ISO 27001, HIPAA or any other security certification, and we do not claim one.** No system is perfectly secure, and we cannot guarantee that a determined attacker will never get in. If you find a vulnerability, please email us before telling anyone else.',
        },
      ],
    },

    {
      id: 'rights',
      heading: '12. Your rights, and how to use them',
      blocks: [
        {
          kind: 'p',
          text: 'Wherever you live, you can ask us to:',
        },
        {
          kind: 'ul',
          items: [
            'Tell you what personal information we hold about you, and why.',
            'Give you a copy of it in a portable format.',
            'Correct anything that is wrong.',
            'Delete your account and the information attached to it.',
            'Stop sending you notifications, or withdraw a consent you gave.',
            'Restrict or object to a particular use, where the law gives you that right.',
          ],
        },
        {
          kind: 'p',
          text: `To do any of these, email ${LEGAL_CONTACT_EMAIL} from the address on your account and say what you want. Emailing from the account address is how we verify it is you; we will not ask you for identity documents unless there is no other way to be sure. We aim to answer within 30 days, and we will tell you if we need longer.`,
        },
        {
          kind: 'p',
          text: 'We will never treat you worse, charge you more or give you less because you exercised a privacy right.',
        },
      ],
    },

    {
      id: 'deletion',
      heading: '13. Deleting your account',
      blocks: [
        {
          kind: 'callout',
          tone: 'info',
          title: 'How deletion works today',
          items: [
            '**Become does not yet have a "delete my account" button in the app.** We are telling you that rather than describing one that is not there.',
            `Today the process is: email ${LEGAL_CONTACT_EMAIL} from the address on your account and ask us to delete it. We will confirm it is you, confirm you want it, and then delete within ${LEGAL_DELETION_DAYS} days.`,
            'Cancel your paid plan first, or ask us to cancel it as part of the same request, so a renewal is not charged while the deletion is in progress.',
            'In-app deletion is being built. When it ships, this section will be updated to describe it.',
          ],
        },
        { kind: 'p', text: 'Deletion covers your account record and the data attached to it: your profile and body stats, injury notes, training logs and schedules, nutrition logs and custom foods, meals and recipes, mind and mood data and journal entries, uploaded photos, push subscriptions, and posts you authored in groups and events.' },
        { kind: 'p', text: 'Some things do not simply disappear, and you should know which:' },
        {
          kind: 'ul',
          items: [
            'Billing records that Stripe and we are required to keep for tax and accounting.',
            'Entries in the shared food catalogue that other members’ logs already reference. Those are separated from you rather than deleted, so that other people’s history does not break.',
            'Copies in routine backups, until those backups age out on their normal schedule.',
            'Anything we are required to keep to comply with a legal obligation or to defend a legal claim.',
          ],
        },
      ],
    },

    {
      id: 'children',
      heading: '14. Children',
      blocks: [
        {
          kind: 'p',
          text: `The Service is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe we have, email ${LEGAL_CONTACT_EMAIL} and we will delete it. The minimum age for an account is in section 4 of the [Terms](/terms).`,
        },
      ],
    },

    {
      id: 'california',
      heading: '15. California',
      blocks: [
        {
          kind: 'p',
          text: 'This section is for California residents, and covers both CalOPPA and the CCPA as amended by the CPRA.',
        },
        {
          kind: 'p',
          text: 'This policy is linked from the Become home page and from the sign-in screen, in both cases with the word "Privacy". Section 3 lists the categories of personal information we collect, section 5 says why, section 4 says where it comes from, section 8 says who receives it, and section 18 says how you will learn about changes.',
        },
        {
          kind: 'p',
          text: 'In CCPA terms, the categories we collect are: identifiers (email address, account identifiers, IP address); customer records (name); commercial information (your plan and subscription status); internet or network activity (feature usage and diagnostics); sensitive personal information (health-related information you enter, such as weight, biological sex, injury notes, mood and meal photos); and inferences drawn from the above (such as your calculated calorie and macro targets).',
        },
        {
          kind: 'p',
          text: '**We have not sold or shared personal information in the preceding 12 months**, including the personal information of anyone under 16. We use sensitive personal information only to provide the Service you asked for, which is a purpose the CCPA permits without a separate right to limit.',
        },
        {
          kind: 'p',
          text: 'Californians may exercise the rights to know, delete, correct, opt out of sale or sharing (which does not arise here), limit the use of sensitive personal information, and not be discriminated against. Use the process in section 12.',
        },
        {
          kind: 'p',
          text: 'Do Not Track: browsers send this signal in inconsistent ways and there is no agreed standard for responding to it, so we do not respond to it. We do not track you across other websites in any case. Under California’s Shine the Light law, we do not disclose personal information to third parties for their own direct marketing.',
        },
        {
          kind: 'todo',
          text: 'Whether Become must honour the Global Privacy Control given that it neither sells nor shares personal information, and what verification process is required for an authorised agent making a request on a Californian member’s behalf.',
        },
      ],
    },

    {
      id: 'europe',
      heading: '16. Europe and the United Kingdom',
      blocks: [
        {
          kind: 'p',
          text: `Become is reachable worldwide, so this section applies if you are in the EEA, the UK or Switzerland. ${LEGAL_ENTITY} is the controller. Our legal bases are in section 5.`,
        },
        {
          kind: 'p',
          text: 'You have the rights to access, rectification, erasure, restriction, portability and objection, and the right to withdraw a consent at any time without affecting what was done before you withdrew it. You can also complain to your local supervisory authority, or to the Information Commissioner’s Office in the UK.',
        },
        {
          kind: 'todo',
          text: 'Whether Become is required to appoint an Article 27 representative in the EU and in the UK, and whether a Data Protection Officer is required, before it markets to members in those regions.',
        },
      ],
    },

    {
      id: 'transfers',
      heading: '17. International transfers',
      blocks: [
        {
          kind: 'p',
          text: 'Become operates from the United States and its processors are principally United States companies. If you use Become from outside the United States, your personal information is transferred to and processed in the United States, which may not give it the same protection as the law where you live.',
        },
        {
          kind: 'todo',
          text: 'The transfer mechanism that must be in place with each processor before Become markets to EEA or UK residents: Standard Contractual Clauses, the UK International Data Transfer Addendum, or the EU-US Data Privacy Framework, and which of Become’s processors are certified under it.',
        },
      ],
    },

    {
      id: 'changes',
      heading: '18. Changes to this policy',
      blocks: [
        {
          kind: 'p',
          text: 'We may update this policy. The version and the date at the top of this page always show what is current. If a change materially affects how we handle your personal information, we will tell you by email or in the app before it takes effect.',
        },
      ],
    },

    {
      id: 'contact',
      heading: '19. Contact',
      blocks: [
        {
          kind: 'p',
          text: `Privacy questions, requests and complaints: email ${LEGAL_CONTACT_EMAIL}, or write to us at the address at the bottom of this page. For help using the app, see [Support](/support).`,
        },
      ],
    },
  ],
}
