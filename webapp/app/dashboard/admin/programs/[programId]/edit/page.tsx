import EditProgramClient from './EditProgramClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ programId: string }>
}

export default async function AdminEditProgramPage({ params }: PageProps) {
  const { programId } = await params
  return <EditProgramClient programId={programId} />
}
