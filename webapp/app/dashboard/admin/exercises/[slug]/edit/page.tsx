import EditExerciseClient from './EditExerciseClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function AdminEditExercisePage({ params }: PageProps) {
  const { slug } = await params
  return <EditExerciseClient slug={slug} />
}
