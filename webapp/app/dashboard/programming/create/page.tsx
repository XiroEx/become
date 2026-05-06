import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Program authoring has been moved to the admin section.
// Any existing links land here and are forwarded.
export default function LegacyCreateProgramPage() {
  redirect('/dashboard/admin/programs/new');
}
