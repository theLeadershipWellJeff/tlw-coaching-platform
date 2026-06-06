import { PageHeader } from '@/app/components/layout/PageHeader'
import { ClientsRoster } from './ClientsRoster'

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Client Roster"
        subtitle="Your full client directory — active and inactive, one click to each."
      />
      <ClientsRoster />
    </>
  )
}
