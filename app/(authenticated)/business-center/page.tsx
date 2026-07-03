import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { BusinessCenterSurface } from '@/components/business-center/BusinessCenterSurface'

export default function BusinessCenterPage() {
  return (
    <>
      <PageHeader
        eyebrow="theLeadershipWell"
        title="Business Center"
        subtitle="Billing, accounts, and invoices"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/business-center/invoices"
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              Invoices
            </Link>
            <Link
              href="/business-center/run"
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-deep/90"
            >
              Run billing
            </Link>
          </div>
        }
      />
      <BusinessCenterSurface />
    </>
  )
}
