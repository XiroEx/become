// PUBLIC route. This is the URL Google Play's Data safety form asks for: "a
// web link where users can request deletion of their account and data".
//
// It must render SIGNED OUT, with no JavaScript and no session — a Play
// reviewer opens it cold, from a search result, without the app installed. It
// lives outside /dashboard for exactly that reason (middleware.ts only guards
// /dashboard/:path*), and it is a server component so there is nothing to
// hydrate before the words appear.
//
// The copy is data, in lib/legal/deleteAccount.ts, for the same reason the rest
// of the legal surface is: the facts it states — the length of the undo window,
// the deletion deadline, the support address — are the same constants the code
// uses, so the page and the behaviour cannot drift apart.

import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { DELETE_ACCOUNT } from '@/lib/legal/deleteAccount'

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your Become account and the data attached to it: two taps in the app, what happens the moment you confirm, the 7-day undo window, and how to ask by email if you cannot get into the app.',
}

export default function DeleteAccountPage() {
  return <LegalDocument doc={DELETE_ACCOUNT} />
}
