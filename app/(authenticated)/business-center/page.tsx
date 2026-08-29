import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { BusinessCenterSurface } from '@/components/business-center/BusinessCenterSurface'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export default async function BusinessCenterPage() {
  // The Command Center button is supervisor-only. Checked server-side so the
  // link never renders in a regular coach's HTML at all — matching the
  // requireSupervisor gate the /api/coaches routes already enforce. Any
  // hiccup (no session, DB blip) just means no button.
  let isSupervisor = false
  try {
    const coach = await getSessionCoach(getSupabaseAdmin())
    isSupervisor = coach?.role === 'supervisor'
  } catch {
    isSupervisor = false
  }

  return (
    <>
      <PageHeader
        eyebrow="theLeadershipWell"
        title="Business Center"
        subtitle="Billing, accounts, and invoices"
        actions={
          <div className="flex items-center gap-2">
            {isSupervisor && (
              <Link
                href="/business-center/coaches"
                className="rounded-tlw-lg border border-tlw-navy-deep/30 px-3 py-1.5 text-[13px] font-medium text-tlw-navy-deep transition-colors hover:bg-tlw-navy-deep/[0.06]"
              >
                Command Center
              </Link>
            )}
            <Link
              href="/business-center/invoices"
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              Invoices
            </Link>
            <Link
              href="/business-center/invoices?new=1"
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-deep/90"
            >
              + Create invoice
            </Link>
          </div>
        }
      />
      <BusinessCenterSurface />
    </>
  )
}
