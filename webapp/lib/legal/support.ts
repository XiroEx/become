// Support page for /support.
//
// This is the URL App Store Connect asks for as the "Support URL", so it has to
// be a real page a human can act on, not a link to a contact form that does not
// exist. Everything on it is something Become can actually do today: one email
// address, a response range rather than a promise, the real cancellation path,
// and the real (email-based) account deletion path.

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DELETION_DAYS,
  LEGAL_SUPPORT_RESPONSE,
  RENEWAL_TERMS,
  type LegalDoc,
} from '@/lib/legal'

export const SUPPORT: LegalDoc = {
  slug: 'support',
  title: 'Support',
  standfirst: 'One inbox, answered by a person. Here is how to reach it and what to send.',
  sections: [
    {
      id: 'contact',
      heading: 'Get help',
      blocks: [
        {
          kind: 'callout',
          tone: 'info',
          title: `Email ${LEGAL_CONTACT_EMAIL}`,
          items: [
            `We reply within ${LEGAL_SUPPORT_RESPONSE}, and usually sooner. If you have not heard back after that, send the message again; occasionally one gets filtered.`,
            'There is no phone line and no live chat. Email is the whole support channel, and it is read by a person.',
            'Write from the email address on your account where you can. It is how we know it is you, and it saves a round trip.',
          ],
        },
      ],
    },

    {
      id: 'what-to-send',
      heading: 'What to include',
      blocks: [
        {
          kind: 'p',
          text: 'The more of this you send first time, the faster this goes:',
        },
        {
          kind: 'ul',
          items: [
            'The email address on your account.',
            'What you were trying to do, and what happened instead.',
            'The screen or feature it happened on, and roughly when.',
            'Your device and browser, for example "iPhone 15, Safari" or "Windows, Chrome".',
            'Whether it happens every time or just happened once.',
            'A screenshot, if you have one.',
          ],
        },
        {
          kind: 'p',
          text: 'If it is about a charge, add the date and the amount, and the last four digits shown on your Stripe receipt. **Never send us a full card number.** We do not need it, and we cannot use it.',
        },
      ],
    },

    {
      id: 'billing',
      heading: 'Billing, and how to cancel',
      blocks: [
        {
          kind: 'p',
          text: 'Open the **Plan** page in the app and choose **Manage billing**. That opens the Stripe billing portal, where you can update your payment method, see and download your invoices, and cancel.',
        },
        {
          kind: 'ul',
          items: [...RENEWAL_TERMS],
        },
        {
          kind: 'p',
          text: 'If you cannot reach the portal for any reason, email us and we will cancel it for you. The full terms, including what happens to refunds, are in the [Terms](/terms).',
        },
      ],
    },

    {
      id: 'signing-in',
      heading: 'Trouble signing in',
      blocks: [
        {
          kind: 'dl',
          items: [
            {
              term: 'The sign-in email has not arrived',
              detail:
                'Check your spam and promotions folders. Links are single use and expire a few minutes after they are sent, so if one has been sitting there a while, request a new one. Keep the tab you requested it from open: it is the tab that signs you in.',
            },
            {
              term: 'Sign in with Google is not working',
              detail:
                'Use the same Google account as the email address on your Become account. If you have several Google accounts signed in, pick deliberately rather than letting the browser choose.',
            },
            {
              term: 'My passkey is gone',
              detail:
                'A passkey lives on the device or in the password manager that created it. If you have lost that device, sign in with a one-time email link instead, and then register a new passkey. It is worth registering a second one on another device.',
            },
            {
              term: 'I changed email address',
              detail: 'Email us from the old address if you still have it, or from the new one if you do not, and we will sort it out.',
            },
          ],
        },
      ],
    },

    {
      id: 'delete',
      heading: 'Deleting your account',
      blocks: [
        {
          kind: 'p',
          text: `There is no delete button in the app yet. Email ${LEGAL_CONTACT_EMAIL} from the address on your account, ask us to delete it, and we will confirm and then delete within ${LEGAL_DELETION_DAYS} days. Cancel any paid plan first, or ask us to cancel it in the same message. What deletion covers, and the few things that survive it, is set out in the [Privacy Policy](/privacy).`,
        },
      ],
    },

    {
      id: 'data',
      heading: 'Your data',
      blocks: [
        {
          kind: 'p',
          text: 'To get a copy of your data, correct something that is wrong, or ask what we hold, email us from your account address. The full list of what you can ask for is in the [Privacy Policy](/privacy).',
        },
      ],
    },

    {
      id: 'bugs',
      heading: 'Report a bug, or a security problem',
      blocks: [
        {
          kind: 'p',
          text: 'Bugs: email us with "Bug" in the subject line and as much of the detail above as you have.',
        },
        {
          kind: 'p',
          text: 'Security: if you think you have found a vulnerability, email us with "Security" in the subject line and please give us a chance to fix it before telling anyone else.',
        },
      ],
    },

    {
      id: 'health',
      heading: 'Health and emergencies',
      blocks: [
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Support cannot help with a medical problem',
          items: [
            'Become is not medical care and not medical advice. If you are hurt or unwell, talk to a physician.',
            'In an emergency in the United States, call 911. Outside the United States, call your local emergency number.',
            'If you are in crisis or thinking about harming yourself, call or text 988 in the United States for the Suicide and Crisis Lifeline.',
          ],
        },
      ],
    },

    {
      id: 'legal',
      heading: 'The legal pages',
      blocks: [
        {
          kind: 'ul',
          items: [
            '[Terms of Service](/terms): what the Service is, subscription and renewal terms, cancellation, and the health disclaimer.',
            '[Privacy Policy](/privacy): what we collect, who processes it, how long we keep it, and your rights.',
          ],
        },
      ],
    },
  ],
}
