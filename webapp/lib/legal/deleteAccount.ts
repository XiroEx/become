// The PUBLIC deletion-request page, at /delete-account.
//
// This URL exists because Google Play's Data safety form asks for one: "a web
// link where users can request deletion of their account and data", reachable
// WITHOUT installing the app and WITHOUT signing in. Play reviewers open it
// cold, so it renders signed out, with no JavaScript and no session — the same
// contract /terms, /privacy and /support are held to.
//
// It is also the page a member lands on when they cannot get into the app at
// all, which is the case the in-app button cannot serve. So it says both
// things: here is the button, and here is what to do if you cannot reach it.
//
// Everything on it is something Become actually does today. The in-app route
// is app/api/me/account (DELETE), the undo link is app/api/me/account/restore,
// and the sweep that finishes the job is app/api/cron/purge-deletions.

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DELETION_DAYS,
  type LegalDoc,
} from '@/lib/legal'
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/accountDeletion'

export const DELETE_ACCOUNT: LegalDoc = {
  slug: 'delete-account',
  title: 'Delete your account',
  standfirst:
    'You can delete your Become account yourself, from inside the app, in two taps. Here is exactly what happens when you do.',
  sections: [
    {
      id: 'in-app',
      heading: 'The fastest way: delete it in the app',
      blocks: [
        {
          kind: 'callout',
          tone: 'info',
          title: 'Settings → Delete account',
          items: [
            'Open Become — the app on your phone, or [the web app](/dashboard/settings?tab=settings) in a browser — and sign in.',
            'Go to **Settings**, scroll to **Danger zone**, and tap **Delete account**.',
            'Confirm. That is the whole process, and it is the same two taps on iOS, on Android and on the web.',
          ],
        },
        {
          kind: 'p',
          text: 'Already signed in? Go straight there: [Settings → Danger zone](/dashboard/settings?tab=settings#danger-zone).',
        },
      ],
    },

    {
      id: 'what-happens',
      heading: 'What happens the moment you confirm',
      blocks: [
        {
          kind: 'ul',
          items: [
            'You are signed out on that device.',
            'Every push notification registration on your account is deleted straight away — the one in your browser, and the ones on your iPhone and Android phone. Nothing from Become reaches you again.',
            `We email the address on your account a confirmation with an undo link, and hold your data, recoverable, for ${ACCOUNT_DELETION_GRACE_DAYS} days.`,
            `After those ${ACCOUNT_DELETION_GRACE_DAYS} days your data is erased permanently, and the whole request is finished well inside the ${LEGAL_DELETION_DAYS} days our [Privacy Policy](/privacy#deletion) commits to.`,
          ],
        },
        {
          kind: 'p',
          text: `**Cancel any paid plan first**, or ask us to cancel it in the same breath, so a renewal is not charged while the deletion is in progress. The Plan page in the app opens the Stripe billing portal, where cancelling takes one click.`,
        },
      ],
    },

    {
      id: 'undo',
      heading: 'Changed your mind',
      blocks: [
        {
          kind: 'p',
          text: `The confirmation email contains a **Keep my account** link. Open it any time within ${ACCOUNT_DELETION_GRACE_DAYS} days — in the app or in any browser, signed in or not — and your account and all of your data come back untouched. Signing back in and using **Keep my account** in Settings does the same thing. Notifications are the one thing that does not come back on its own: they were switched off at the moment you asked, and they stay off until you turn them on again in Settings.`,
        },
        {
          kind: 'p',
          text: `After the ${ACCOUNT_DELETION_GRACE_DAYS} days, it cannot be undone. There is no copy left to restore from, which is the point.`,
        },
      ],
    },

    {
      id: 'by-email',
      heading: 'If you cannot get into the app',
      blocks: [
        {
          kind: 'p',
          text: `Lost the device, cannot receive the sign-in email, or the app will not open? Email ${LEGAL_CONTACT_EMAIL} from the address on your account, ask us to delete it, and we will confirm it is you and then delete it. Write **Delete my account** in the subject line so it is not missed.`,
        },
        {
          kind: 'p',
          text: `We answer within 1 to 3 business days and finish within ${LEGAL_DELETION_DAYS} days of the request. If you no longer have access to the email address on the account, say so and tell us what you do have — we will work out another way to be sure it is you rather than delete somebody else's account on a stranger's say-so.`,
        },
      ],
    },

    {
      id: 'what-goes',
      heading: 'What is deleted, and what is not',
      blocks: [
        {
          kind: 'p',
          text: 'Deleted: your account record, profile and body stats, injury notes, training logs, schedules and programs you saved, nutrition logs, custom foods, meals and recipes, mind and mood data, journal entries, sleep and check-in history, uploaded photos, chat messages, push registrations, and anything you shared from the app.',
        },
        { kind: 'p', text: 'Not deleted, and you should know which:' },
        {
          kind: 'ul',
          items: [
            'Billing records Stripe and we are required to keep for tax and accounting.',
            'Entries in the shared food and exercise catalogue, and programs other members are enrolled in, that other people’s history already references. Your name is removed from them; the entry itself stays so that other people’s logs do not break.',
            'Copies sitting in routine backups, until those backups age out on their normal schedule.',
            'Anything we are required to keep to comply with a legal obligation or to defend a legal claim.',
          ],
        },
      ],
    },

    {
      id: 'rights',
      heading: 'Your other rights',
      blocks: [
        {
          kind: 'p',
          text: 'Deleting is not the only thing you can ask for. You can also ask for a copy of your data, ask us to correct something, or ask what we hold and why — wherever you live, not only in California or Europe. Section 12 of the [Privacy Policy](/privacy#rights) sets out the full list and how to use it.',
        },
        {
          kind: 'p',
          text: 'We will never treat you worse, charge you more or give you less because you asked to delete your account or exercised any other privacy right.',
        },
      ],
    },
  ],
}
