import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'

/**
 * Billing Run review page — shell for Phase 3.
 * Phase 3 will add the run assembler, draft list, and approve actions here.
 */
export default function BillingRunPage() {
  return (
    <>
      <PageHeader
        breadcrumb="Business Center"
        title="Billing run"
        subtitle="Assemble, review, and approve this period's invoices"
        actions={
          <Link
            href="/business-center"
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            ← Back
          </Link>
        }
      />
      <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-12 text-center">
        <p className="text-[14px] font-medium text-tlw-navy-deep">Run assembler coming in Phase 3</p>
        <p className="mt-1 text-[13px] text-tlw-warm-gray">
          Drafts will be assembled here — one invoice per account, ready for your review and approval.
        </p>
      </div>
    </>
  )
}
