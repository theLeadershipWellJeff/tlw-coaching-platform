import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { TranscriptsList } from './TranscriptsList'

export default function ClientTranscriptsPage({ params }: { params: { id: string } }) {
  return (
    <>
      <PageHeader breadcrumb="Clients" title="Transcripts" />
      <Link
        href={`/clients/${params.id}`}
        className="mb-4 inline-block text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
      >
        ← Back to client
      </Link>
      <TranscriptsList clientId={params.id} />
    </>
  )
}
