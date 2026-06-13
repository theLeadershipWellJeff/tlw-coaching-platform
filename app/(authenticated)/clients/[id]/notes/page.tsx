import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { NotesPanel } from '../NotesPanel'

export default function ClientNotesPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { new?: string }
}) {
  return (
    <>
      <PageHeader breadcrumb="Clients" title="Session notes" />
      <Link
        href={`/clients/${params.id}`}
        className="mb-4 inline-block text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
      >
        ← Back to client
      </Link>
      <NotesPanel clientId={params.id} autoNew={searchParams?.new === '1'} />
    </>
  )
}
