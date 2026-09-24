// Terms of Service for /terms.
//
// DRAFTED BY AN AI. NOT LEGAL ADVICE. Every `kind: 'todo'` block is a question
// for a lawyer, and they render visibly on the page so none of them can ship
// unnoticed. See lib/legal.ts for the shared facts and the document shape.
//
// Three things this document has to do that a generic template does not:
//   1. New York GBL 527-a. The automatic-renewal terms are stated in full, and
//      the SAME sentences (RENEWAL_TERMS) are rendered next to the checkout
//      button on the plan page, which is where consent is actually asked for.
//   2. The health disclaimer sits FIRST, above everything, because it is the
//      one clause a member of a fitness app most needs to have read.
//   3. Nothing is invented. There is no arbitration clause here because nobody
//      has drafted one; that absence is stated rather than papered over.

import {
  LEGAL_COMPLIMENTARY_PLUS_COUNT,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTION,
  LEGAL_GOVERNING_LAW,
  LEGAL_MINIMUM_AGE,
  LEGAL_PRIMARY_DOMAIN,
  LEGAL_REFUND_WINDOW_DAYS,
  LEGAL_SECONDARY_DOMAIN,
  LEGAL_VENUE,
  RENEWAL_TERMS,
  type LegalDoc,
} from '@/lib/legal'

export const TERMS: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Service',
  standfirst: `The agreement between you and ${LEGAL_ENTITY} for using Become. Please read the health section first.`,
  sections: [
    {
      id: 'health',
      heading: '1. Health and safety: read this first',
      blocks: [
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Become is not medical care and not medical advice',
          items: [
            'Become is a fitness, nutrition and mindset product. Nothing in it is a diagnosis, a treatment, a prescription, or a substitute for a licensed physician, dietitian, therapist or other qualified professional.',
            'Talk to a physician before starting any exercise or nutrition program, and especially if you are pregnant or postpartum, recovering from injury or surgery, under 18, over 65, or living with a heart condition, high blood pressure, diabetes, an eating disorder, a metabolic or musculoskeletal condition, or any other medical condition, or if you take medication.',
            'Exercise carries a real risk of injury, up to and including serious injury or death. By using Become you accept that risk voluntarily and take responsibility for your own decisions in the gym, in the kitchen and everywhere else.',
            'Stop immediately and seek medical help if you feel pain, dizziness, faintness, chest discomfort, unusual shortness of breath, or anything else that seems wrong.',
            'If you are in crisis or thinking about harming yourself, Become is not the right tool. In the United States, call or text 988 for the Suicide and Crisis Lifeline, or call 911. Outside the United States, contact your local emergency number.',
          ],
        },
        {
          kind: 'p',
          text: 'The programs in Become are general programming, not personal supervision. No one at Become is watching your session in real time, checking your form, or adjusting your load for how you feel today. You are. Scale the work to your own ability, and stop when you need to.',
        },
      ],
    },

    {
      id: 'about',
      heading: '2. Who we are, and what these Terms cover',
      blocks: [
        {
          kind: 'p',
          text: `These Terms of Service are an agreement between you and ${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTION} (referred to here as "Become", "we" or "us"). They cover your use of the Become app and website at ${LEGAL_PRIMARY_DOMAIN} and ${LEGAL_SECONDARY_DOMAIN}, together with everything in them (the "Service").`,
        },
        {
          kind: 'p',
          text: 'By creating an account or using the Service you agree to these Terms and to the [Privacy Policy](/privacy), which is part of them. If you do not agree, do not use the Service.',
        },
      ],
    },

    {
      id: 'service',
      heading: '3. What the Service is, and what it is not',
      blocks: [
        { kind: 'p', text: 'Become gives you:' },
        {
          kind: 'ul',
          items: [
            'Coach-led, multi-phase training programs, and a weekly schedule built from them.',
            'Workout logging, with sets, load, personal records and history.',
            'Nutrition logging, including estimation of a meal from a photo or a description using AI.',
            'An AI workout generator that builds a session from your goal, level and available equipment.',
            'A 50-session mindset path, with journaling, mood tracking and progress.',
          ],
        },
        {
          kind: 'p',
          text: '**Become does not promise a result.** We do not promise that you will lose or gain a specific amount of weight, reach a specific lift, or reach any other outcome, on any timeline or at all. What you get out of it depends on what you put in, on your body, and on many things neither of us controls.',
        },
        {
          kind: 'p',
          text: 'We build quickly. Features can change, move or be withdrawn. If we withdraw something a paid plan specifically promised, we will tell paying members before it goes.',
        },
      ],
    },

    {
      id: 'eligibility',
      heading: '4. Eligibility and age',
      blocks: [
        {
          kind: 'p',
          text: `You must be at least ${LEGAL_MINIMUM_AGE} years old to create an account. When you create an account, and again whenever these Terms change in a way you need to agree to, you confirm that you are at least ${LEGAL_MINIMUM_AGE}, and we record that confirmation together with the date and the version of the Terms you agreed to.`,
        },
        {
          kind: 'p',
          text: '**If you are under 18**, you may use the Service only with the permission of a parent or legal guardian, who agrees to these Terms on your behalf and is responsible for your use of the Service, including any purchase. You must also not be barred from using the Service under any applicable law.',
        },
        {
          kind: 'p',
          text: `The Service is not directed to children under ${LEGAL_MINIMUM_AGE}, and we do not knowingly collect personal information from them. If you believe a child under ${LEGAL_MINIMUM_AGE} has given us personal information, email us and we will delete it.`,
        },
        {
          kind: 'todo',
          text: 'Members aged 13 to 17 are admitted on their own say-so plus a parent-or-guardian permission clause. Confirm whether that permission needs to be verified and recorded (for example a guardian email confirmation), whether a minor can validly agree to the subscription terms at all in New York, and what the resulting App Store and Google Play age ratings must be.',
        },
      ],
    },

    {
      id: 'account',
      heading: '5. Your account and signing in',
      blocks: [
        {
          kind: 'p',
          text: 'Become is passwordless. You sign in with a one-time link sent to your email address, with Google, or with a passkey. For those methods there is no password for you to remember and none for us to store.',
        },
        {
          kind: 'ul',
          items: [
            '**A sign-in link is a credential.** Anyone with access to your email inbox while a link is live can sign in as you. Keep your email account secure. Links are single use and expire shortly after they are sent.',
            'Keep the details on your account accurate, and keep your email address current, because it is how you get back in.',
            'One account per person. Do not share an account, and do not let anyone else use yours.',
            'You are responsible for activity under your account. Email us immediately if you think someone else has access to it.',
          ],
        },
      ],
    },

    {
      id: 'acceptable-use',
      heading: '6. Acceptable use',
      blocks: [
        { kind: 'p', text: 'While using the Service, you agree not to:' },
        {
          kind: 'ul',
          items: [
            'Break the law, or use Become to help anyone else break it.',
            'Copy, resell, redistribute or publish the programs, exercise content, videos or mindset material, in whole or in part, or use them to build a competing product.',
            'Scrape, crawl, bulk-download or otherwise take data out of the Service by automated means, or access it other than through the interfaces we provide.',
            'Reverse engineer, decompile or attempt to derive source code, except where the law says you may.',
            'Probe, overload, disrupt or attempt to break the Service, or interfere with anyone else using it.',
            'Get around, or try to get around, plan limits, allowances, gates, rate limits or payment.',
            'Upload another person’s personal, medical or confidential information, or impersonate anyone.',
            'Post content that is unlawful, abusive, harassing, hateful, sexually explicit, or that infringes someone else’s rights, to any shared or community surface.',
            'Use the AI features to produce content intended to harm, deceive or endanger anyone.',
          ],
        },
        {
          kind: 'p',
          text: 'We may remove content and suspend accounts that break this section. Where it is reasonable to do so, we will tell you first.',
        },
      ],
    },

    {
      id: 'your-content',
      heading: '7. Your content',
      blocks: [
        {
          kind: 'p',
          text: '"Your Content" means what you put into Become: workout logs, weights and measurements, moods, journal entries, injury and equipment notes, meals and foods you log, photos of meals, profile and progress photos, custom programs, sessions, exercises, meals and recipes, feedback, and anything you post to a group or event.',
        },
        {
          kind: 'p',
          text: '**You keep ownership of Your Content.** You give us a non-exclusive, worldwide, royalty-free licence to host, store, copy, transmit, display and process it for one purpose: running and improving the Service for you. That includes sending a meal photo or a description to our AI provider so it can return an estimate, and storing images in our object storage. The licence ends when the content is deleted, except for copies sitting in routine backups until those backups age out.',
        },
        {
          kind: 'p',
          text: 'Some features share deliberately: a shared session, a program a coach shares into your library, a community group or event. Anything you put on a shared surface can be seen by the people it is shared with. Do not put anything there that you would not want them to have.',
        },
        {
          kind: 'p',
          text: 'We do not sell Your Content, and we do not use it to advertise to you. What we do with it, and who processes it for us, is set out in the [Privacy Policy](/privacy).',
        },
        {
          kind: 'todo',
          text: 'Whether Become can state that its AI provider does not use member content to train models. That depends on the exact Google Gemini terms applying to the redbtn platform account Become dispatches through, and on the agreement between Become and the platform operator. Until it is confirmed, this document makes no claim either way.',
        },
      ],
    },

    {
      id: 'ai',
      heading: '8. AI features, and what an estimate is',
      blocks: [
        {
          kind: 'callout',
          tone: 'warning',
          title: 'An AI estimate is an approximation, not a measurement',
          items: [
            'Calories, macros, portion sizes and food identification produced from a photo or a description can be wrong, sometimes badly wrong. Treat every number as a starting point and correct it.',
            'Generated workouts are suggestions built from what you told us. They are not reviewed by a coach before you see them, and they cannot see your body, your form or your medical history.',
            'Never rely on AI output for a medical, dietary or safety decision. If a number really matters, such as an allergen, a medical diet or a medication interaction, check the label or ask a professional.',
          ],
        },
        {
          kind: 'p',
          text: 'AI features depend on third-party providers, and they can be unavailable, slow, rate-limited or capped by your plan. Where an AI feature is unavailable, Become falls back to a non-AI version of the same job wherever it can.',
        },
        {
          kind: 'p',
          text: 'Using an AI feature means sending what you submit for it to a third-party AI provider. **We ask for your permission separately before anything is sent, and nothing is sent until you give it.** You can withdraw that permission at any time in Settings, and the AI features then stop sending and fall back. Section 7 of the [Privacy Policy](/privacy) lists exactly what is sent and to whom.',
        },
      ],
    },

    {
      id: 'plans',
      heading: '9. Plans, prices and automatic renewal',
      blocks: [
        {
          kind: 'p',
          text: 'Become has a free plan with limits on some features, and a paid plan called Plus that removes them. You can use the free plan for as long as you like.',
        },
        {
          kind: 'callout',
          tone: 'info',
          title: 'Automatic renewal terms',
          items: [...RENEWAL_TERMS],
        },
        {
          kind: 'p',
          text: 'Payment is handled by **Stripe**. The price you see is the price you pay: any applicable sales tax is included in it, and Stripe shows you the total before you confirm. Become never receives or stores your card number. You authorise the recurring charge when you complete checkout, and that authorisation continues until you cancel.',
        },
        {
          kind: 'p',
          text: 'If a renewal payment fails, Stripe may retry it. If it keeps failing, your account may lose Plus and return to the free plan after a short grace period. You can fix the payment method at any time under Manage billing.',
        },
        {
          kind: 'p',
          text: `Some early members hold a complimentary Plus grant. ${LEGAL_COMPLIMENTARY_PLUS_COUNT} accounts have that grant permanently, at no charge and with no renewal. We will not start charging those accounts for Plus.`,
        },
        {
          kind: 'p',
          text: 'If we change the price of a plan, the change does not apply to a period you have already paid for. We will tell you before a new price takes effect for you, so you can cancel first if you want to.',
        },
        {
          kind: 'todo',
          text: 'The notice period and the notice mechanism required before an automatic-renewal price change, under New York GBL 527-a and the automatic-renewal statutes of the other states Become sells into (California, Colorado and others). This draft commits to notice "before" a change without naming a number.',
        },
        {
          kind: 'todo',
          text: 'Whether New York GBL 527-a also requires Become to send a separate renewal reminder before each renewal for annual plans, and, if so, at what interval and with what content.',
        },
      ],
    },

    {
      id: 'cancelling',
      heading: '10. Cancelling, and refunds',
      blocks: [
        {
          kind: 'p',
          text: 'To cancel, open the Plan page in the app, choose Manage billing, and cancel in the Stripe billing portal. You can also email us and we will do it for you. Cancelling takes effect at the end of the period you have already paid for; your Plus access continues until then and the plan is not renewed afterwards.',
        },
        {
          kind: 'p',
          text: `**Your first payment is refundable in full for ${LEGAL_REFUND_WINDOW_DAYS} days.** If you start a paid plan and decide within ${LEGAL_REFUND_WINDOW_DAYS} days of the first payment on your account that it is not for you, email ${LEGAL_CONTACT_EMAIL} from the address on your account and we will refund that payment in full and cancel the plan. You do not have to give a reason. This applies once, to the first charge on your account, whether it was for a month or a year; it does not apply to renewals, and it does not apply to a payment taken by an app store (see below).`,
        },
        {
          kind: 'p',
          text: '**After that window, cancelling part-way through a period does not by itself produce a refund, and we do not automatically refund the unused part of a period you have already paid for.**',
        },
        {
          kind: 'p',
          text: `If something has actually gone wrong, email ${LEGAL_CONTACT_EMAIL} and we will look at it. That includes being charged twice, being charged after you cancelled, being charged an amount you did not agree to, or the Service not working for a period you paid for.`,
        },
        {
          kind: 'p',
          text: 'If we close a paid account for a reason other than your breach of these Terms, we will refund the unused part of the period you had already paid for.',
        },
        {
          kind: 'p',
          text: 'If you ever buy Become through an app store rather than from us, that store takes the payment and its own refund process applies. We cannot refund a charge we did not take.',
        },
        {
          kind: 'todo',
          text: `The ${LEGAL_REFUND_WINDOW_DAYS}-day first-payment refund is a commercial promise, not a legal one. Confirm what this section must additionally say for members with a statutory cooling-off right, including the 14-day right of withdrawal in the EU and UK, its interaction with immediate access to digital content, and whether that right also has to be honoured on renewals.`,
        },
      ],
    },

    {
      id: 'termination',
      heading: '11. Suspension and termination',
      blocks: [
        {
          kind: 'p',
          text: 'You can stop using the Service at any time, and you can delete your account yourself from Settings — in the app or on the web. How that works, and what deletion covers, is in section 13 of the [Privacy Policy](/privacy) and on the [Delete account](/delete-account) page.',
        },
        {
          kind: 'p',
          text: 'We may suspend or close an account that breaks these Terms, that puts other members or the Service at risk, or where the law requires it. Where it is reasonable, we will tell you first and give you a chance to put it right.',
        },
        {
          kind: 'p',
          text: 'Sections 7 (your content, for the licence in backups), 12, 13, 14, 15 and 17 survive the end of this agreement.',
        },
      ],
    },

    {
      id: 'warranties',
      heading: '12. Disclaimer of warranties',
      blocks: [
        {
          kind: 'p',
          text: 'To the fullest extent the law allows, the Service is provided **as is** and **as available**, without warranties of any kind, whether express, implied or statutory. That includes the implied warranties of merchantability, fitness for a particular purpose, title and non-infringement.',
        },
        {
          kind: 'p',
          text: 'We do not warrant that the Service will be uninterrupted, timely, secure or error-free, that defects will be corrected, that data will never be lost, or that any exercise, nutrition, mindset or AI-generated content is accurate, complete or suitable for you.',
        },
        {
          kind: 'p',
          text: 'Some jurisdictions do not allow the exclusion of implied warranties. Where that is the case, the exclusions above apply only to the extent permitted, and you may have rights that these Terms cannot take away.',
        },
      ],
    },

    {
      id: 'liability',
      heading: '13. Limitation of liability',
      blocks: [
        {
          kind: 'p',
          text: 'To the fullest extent the law allows, Become and its members, managers, employees and contractors are not liable for indirect, incidental, special, consequential, exemplary or punitive damages, or for lost profits, lost revenue, lost data or loss of goodwill, arising out of or connected with the Service, however caused and on any theory of liability.',
        },
        {
          kind: 'p',
          text: 'To the fullest extent the law allows, our total liability for all claims arising out of or connected with the Service is limited to the greater of the amount you paid Become in the 12 months before the event giving rise to the claim, or 100 US dollars.',
        },
        {
          kind: 'p',
          text: 'Nothing in these Terms excludes or limits liability that cannot be excluded or limited by law, including liability for fraud, for willful misconduct, or for death or personal injury caused by negligence where the law does not permit that limitation.',
        },
        {
          kind: 'todo',
          text: 'The liability cap figure and its enforceability in New York for a consumer product that touches physical activity and health-related data, and whether the exclusion of personal-injury damages is enforceable as drafted alongside the assumption of risk in section 1.',
        },
      ],
    },

    {
      id: 'indemnity',
      heading: '14. Indemnity',
      blocks: [
        {
          kind: 'p',
          text: 'You agree to indemnify Become against claims, damages and reasonable costs arising from your breach of these Terms, from content you upload, or from your use of the Service in a way these Terms do not allow.',
        },
        {
          kind: 'todo',
          text: 'Whether a consumer-facing indemnity of this kind is appropriate and enforceable for Become, and if so how it should be scoped and worded.',
        },
      ],
    },

    {
      id: 'disputes',
      heading: '15. Disputes, governing law and venue',
      blocks: [
        {
          kind: 'p',
          text: `Before starting any formal proceeding, please email ${LEGAL_CONTACT_EMAIL} with the details and give us 30 days to try to resolve it. Most problems are faster to fix that way.`,
        },
        {
          kind: 'p',
          text: `These Terms are governed by ${LEGAL_GOVERNING_LAW}, without regard to its conflict of law rules. You and Become agree that any dispute will be brought only in ${LEGAL_VENUE}, and both of us consent to personal jurisdiction there.`,
        },
        {
          kind: 'p',
          text: '**There is no arbitration agreement and no class-action waiver in these Terms.** None has been drafted, so none applies.',
        },
        {
          kind: 'todo',
          text: 'Whether Become wants binding arbitration and a class-action waiver at all. If yes, counsel needs to draft the clause itself: the arbitration provider and rules, seat, cost allocation, the small-claims carve-out, the opt-out mechanism and its deadline, and the notice a member must be given. Nothing of that kind has been invented here.',
        },
        {
          kind: 'p',
          text: 'If the law of the place you live gives you rights that this section cannot override, those rights are unaffected.',
        },
      ],
    },

    {
      id: 'changes',
      heading: '16. Changes to these Terms',
      blocks: [
        {
          kind: 'p',
          text: 'We may update these Terms. The version and the date at the top of this page always show what is current. If a change is material, we will tell you by email or in the app before it takes effect, and continuing to use the Service after that means you accept the new Terms. If you do not accept them, stop using the Service and cancel any paid plan.',
        },
        { kind: 'p', text: 'Ask us and we will send you the version that applied on any given date.' },
      ],
    },

    {
      id: 'app-stores',
      heading: '17. App stores, and Apple’s required licence terms',
      blocks: [
        {
          kind: 'p',
          text: 'Become is a web app you can install to your home screen. If you install it from an app store instead, that store’s own terms also apply to you, the store is not a party to these Terms, and the store is not responsible for the Service, for support or for any claim about it.',
        },
        {
          kind: 'p',
          text: `**The rest of this section applies only if you obtained Become from the Apple App Store.** Apple requires every app publisher to include the terms below (Schedule 1 of the Apple Developer Program Licence Agreement, the minimum terms for a Licensed Application End User Licence Agreement). Where they conflict with anything else in these Terms, these terms win for the App Store version, and “Licensed Application” means the Become app you downloaded. ${LEGAL_ENTITY} is the “Application Provider”.`,
        },
        {
          kind: 'dl',
          items: [
            {
              term: 'Acknowledgement',
              detail: `These Terms are concluded between you and ${LEGAL_ENTITY} only, and not with Apple. ${LEGAL_ENTITY}, not Apple, is solely responsible for the Licensed Application and its content. These Terms do not provide for usage rules for the Licensed Application that conflict with the App Store Terms of Service as of the date you entered into them, and ${LEGAL_ENTITY} acknowledges that it has had the opportunity to review those rules.`,
            },
            {
              term: 'Scope of licence',
              detail:
                'The licence granted to you for the Licensed Application is a non-transferable licence to use it on any Apple-branded products that you own or control, and as permitted by the Usage Rules in the Apple Media Services Terms and Conditions, except that it may also be accessed by other accounts associated with you through Family Sharing or volume purchasing.',
            },
            {
              term: 'Maintenance and support',
              detail: `${LEGAL_ENTITY} is solely responsible for providing any maintenance and support services for the Licensed Application, as specified in these Terms or as required by applicable law. You and ${LEGAL_ENTITY} acknowledge that **Apple has no obligation whatsoever to furnish any maintenance and support services** for the Licensed Application. Our support commitment is on the [Support](/support) page.`,
            },
            {
              term: 'Warranty',
              detail: `${LEGAL_ENTITY} is solely responsible for any product warranties, whether express or implied by law, to the extent they are not effectively disclaimed. In the event of any failure of the Licensed Application to conform to any applicable warranty, you may notify Apple, and Apple will refund the purchase price of the Licensed Application to you; to the maximum extent permitted by applicable law, **Apple will have no other warranty obligation whatsoever** with respect to the Licensed Application. Any other claims, losses, liabilities, damages, costs or expenses attributable to any failure to conform to any warranty are ${LEGAL_ENTITY}’s sole responsibility.`,
            },
            {
              term: 'Product claims',
              detail: `${LEGAL_ENTITY}, and not Apple, is responsible for addressing any claims by you or any third party relating to the Licensed Application or your possession and use of it, including: (a) product liability claims; (b) any claim that the Licensed Application fails to conform to any applicable legal or regulatory requirement; and (c) claims arising under consumer protection, privacy or similar legislation, including in connection with the Licensed Application’s use of the HealthKit and HomeKit frameworks. These Terms do not limit ${LEGAL_ENTITY}’s liability to you beyond what is permitted by applicable law.`,
            },
            {
              term: 'Intellectual property rights',
              detail: `In the event of any third-party claim that the Licensed Application or your possession and use of it infringes that third party’s intellectual property rights, ${LEGAL_ENTITY}, and not Apple, will be solely responsible for the investigation, defence, settlement and discharge of that claim.`,
            },
            {
              term: 'Legal compliance',
              detail:
                'You represent and warrant that you are not located in a country that is subject to a U.S. Government embargo, or that has been designated by the U.S. Government as a “terrorist supporting” country, and that you are not listed on any U.S. Government list of prohibited or restricted parties.',
            },
            {
              term: 'Developer name and address',
              detail: `Questions, complaints or claims about the Licensed Application should be directed to ${LEGAL_ENTITY}, 516 Cambridge Ave, Westbury, NY 11590, United States, ${LEGAL_CONTACT_EMAIL}.`,
            },
            {
              term: 'Third-party terms of agreement',
              detail:
                'You must comply with any applicable third-party terms of agreement when using the Licensed Application — for example, your wireless data service agreement.',
            },
            {
              term: 'Third-party beneficiary',
              detail:
                'You and ' +
                LEGAL_ENTITY +
                ' acknowledge and agree that **Apple, and Apple’s subsidiaries, are third-party beneficiaries of these Terms**, and that, upon your acceptance of these Terms, Apple will have the right (and will be deemed to have accepted the right) to enforce these Terms against you as a third-party beneficiary of them.',
            },
          ],
        },
        {
          kind: 'todo',
          text: 'The equivalent Google Play requirements (the Play Developer Distribution Agreement and the User Data policy), once Become ships through that store; and whether the Apple terms above should be published as a standalone EULA document in App Store Connect rather than, or as well as, a section of these Terms.',
        },
      ],
    },

    {
      id: 'general',
      heading: '18. General',
      blocks: [
        {
          kind: 'ul',
          items: [
            'These Terms and the Privacy Policy are the whole agreement between you and Become about the Service.',
            'If any part is held unenforceable, the rest stays in force.',
            'If we do not enforce something straight away, we have not waived it.',
            'You may not transfer your rights under these Terms. We may transfer ours to a successor in a merger, acquisition or sale of assets.',
            'Nobody other than you and Become has rights under these Terms, except as an app store requires.',
            'Neither of us is liable for a failure caused by something genuinely outside our control.',
            `Notices to us go to ${LEGAL_CONTACT_EMAIL}. Notices to you go to the email address on your account.`,
          ],
        },
      ],
    },

    {
      id: 'contact',
      heading: '19. Contact',
      blocks: [
        {
          kind: 'p',
          text: `Questions about these Terms: email ${LEGAL_CONTACT_EMAIL}, or write to us at the address at the bottom of this page. For help with the app, see [Support](/support).`,
        },
      ],
    },
  ],
}
