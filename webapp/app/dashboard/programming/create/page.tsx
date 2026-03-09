import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { getUserRole } from '@/lib/roles';
import ProgramCreator from './ProgramCreator';

export const dynamic = 'force-dynamic';

export default async function CreateProgramPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) redirect('/login');

  try {
    const payload = verifyToken(token);
    const { role } = await getUserRole(payload.userId);

    if (role === 'user') {
      redirect('/dashboard/programming');
    }
  } catch {
    redirect('/login');
  }

  return <ProgramCreator />;
}
