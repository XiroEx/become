// /delete-account — the PUBLIC page where deletion can be requested.
//
// WHY A PUBLIC URL EXISTS AT ALL, when deletion is two taps inside the app:
//
//   • Google Play's Data safety form asks for a WEB URL where a user can
//     request account deletion, and it is checked from the outside, signed
//     out, by someone who has not installed the app. A page behind the login
//     wall does not answer that question.
//   • Someone who has deleted the app from their phone, or cannot get back in,
//     still has the right to be forgotten (GDPR Art. 17, CCPA, and the state
//     statutes that followed). They need a page that tells them how.
//
// It is DOCUMENTATION PLUS A ROUTE, not a form that takes an email address. A
// public "type an email and we delete that account" box is an account-takeover
// primitive and an email-enumeration oracle in one; the deletion path stays
// authenticated (sign in → Settings → Delete account), and this page says so
// and links to it. The fallback for a member who genuinely cannot sign in is a
// human at the support address, which is verified the same way every other
// rights request is: from the address on the account.

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DELETION_DAYS,
  type LegalDoc,
} from '@/lib/legal'
import { DELETION_COVERS, DELETION_EXCEPTIONS, RESTORE_WINDOW_DAYS } from '@/lib/accountDeletion'

export const DELETE_ACCOUNT: LegalDoc = {
  slug: 'delete-account',
  title: 'Delete your Become account',
  standfirst:
    'How to delete your account and everything attached to it — from the app, from the website, or by asking us.',
  sections: [
    {
      id: 'in-app',
      heading: '1. Delete it yourself, in two taps',
      blocks: [
        {
          kind: 'callout',
          tone: 'info',
          title: 'Where the button is',
          items: [
            '**In the app (iPhone or Android):** open **Settings** from the home screen, scroll to **Delete account**, then confirm.',
            '**On the web:** sign in, open [Settings](/dashboard/settings), scroll to **Delete account**, then confirm.',
            'No email to send, no form to wait on, and nothing to ask us for.',
          ],
        },
        {
          kind: 'p',
          text: 'Confirming signs you out on that device straight away and stops notifications to every device the account is signed in on.',
        },
      ],
    },
    {
      id: 'what-happens',
      heading: '2. What happens next',
      blocks: [
        {
          kind: 'ol',
          items: [
            'We email the address on the account to confirm the request, with a link that undoes it.',
            `You have **${RESTORE_WINDOW_DAYS} days** to change your mind — use the link in that email, or the Keep my account button in Settings if you can still sign in.`,
            `After that the account and its data are permanently deleted. That is well inside the ${LEGAL_DELETION_DAYS} days the [Privacy Policy](/privacy) commits to.`,
          ],
        },
        {
          kind: 'p',
          text: 'Deleting your account does not by itself refund a payment, and a paid plan should be cancelled first — the Plan page in the app does it, or we will do it for you if you ask in the same message.',
        },
      ],
    },
    {
      id: 'covers',
      heading: '3. What is deleted',
      blocks: [
        { kind: 'ul', items: [...DELETION_COVERS] },
        { kind: 'p', text: 'And what does not simply disappear, with the reason:' },
        { kind: 'ul', items: [...DELETION_EXCEPTIONS] },
      ],
    },
    {
      id: 'cannot-sign-in',
      heading: '4. If you cannot sign in',
      blocks: [
        {
          kind: 'p',
          text: `Email ${LEGAL_CONTACT_EMAIL} from the address on the account and ask us to delete it. Sending from that address is how we check it is you; we will not ask you for identity documents unless there is no other way to be sure, and we will not charge you or treat you differently for asking.`,
        },
        {
          kind: 'p',
          text: 'Section 12 of the [Privacy Policy](/privacy) covers the rest of your rights — a copy of your data, a correction, or an objection — and the same address handles all of them.',
        },
      ],
    },
  ],
}
