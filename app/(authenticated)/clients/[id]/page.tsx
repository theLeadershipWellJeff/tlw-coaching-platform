import { PageHeader } from '@/app/components/layout/PageHeader'
import { ClientDetail } from './ClientDetail'

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <PageHeader breadcrumb="Clients" title="Client" />
      <ClientDetail clientId={params.id} />
    </>
  )
}
