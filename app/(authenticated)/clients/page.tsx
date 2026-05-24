import { PageHeader } from '@/app/components/layout/PageHeader'
import { ComingSoon } from '@/app/components/shared/ComingSoon'

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Client Roster"
        subtitle="Your full client directory — active and inactive, one click to each."
      />
      <ComingSoon
        title="Client roster"
        description="Alphabetical roster, active/inactive tabs, multi-select, and bulk email arrive in a later milestone."
      />
    </>
  )
}
