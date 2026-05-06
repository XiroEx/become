import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Program authoring has been split:
//   • Admin authoring → /dashboard/admin/programs/new (admin-gated)
//   • User custom programs → /dashboard/programs/new (premium-tier feature)
// The user-facing path works for everyone (it shows an upsell to lower tiers
// and the full editor to qualifying users), and admins can still author admin
// programs via the admin sub-nav. Bouncing everyone to the admin-gated path
// would 401-redirect non-admin users with stale links.
export default function LegacyCreateProgramPage() {
  redirect('/dashboard/programs/new');
}
