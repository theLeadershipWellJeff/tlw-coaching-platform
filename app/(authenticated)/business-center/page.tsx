import { PageHeader } from '@/app/components/layout/PageHeader'
import { BusinessCenterSurface } from '@/components/business-center/BusinessCenterSurface'

export default function BusinessCenterPage() {
  return (
    <>
      <PageHeader
        eyebrow="theLeadershipWell"
        title="Business Center"
        subtitle="Billing, accounts, and invoices"
      />
      <BusinessCenterSurface />
    </>
  )
}
