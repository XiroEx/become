import EditUserProgramClient from './EditUserProgramClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ programId: string }>;
}

export default async function EditUserProgramPage({ params }: Props) {
  const { programId } = await params;
  return <EditUserProgramClient programId={programId} />;
}
