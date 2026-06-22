import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { DashboardSurface } from '@/components/dashboard/DashboardSurface'
import { DashboardBoard } from './DashboardBoard'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const firstName = (session?.user?.name || '').split(' ')[0] || 'there'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      <PageHeader eyebrow="theLeadershipWell" title={`${greeting()}, ${firstName}`} subtitle={today} />
      {/* The roster + Up next (session prep) and other panels the coach relies on. */}
      <DashboardBoard />
      {/* The customizable card surface lives below the familiar panels. */}
      <div className="mb-4 mt-10 flex items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Cards</span>
        <span className="h-px flex-1 bg-tlw-warm-gray/15" />
      </div>
      <DashboardSurface />
    </>
  )
}
