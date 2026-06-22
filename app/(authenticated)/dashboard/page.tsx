import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { DashboardSurface } from '@/components/dashboard/DashboardSurface'

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
      {/* One unified, arrangeable board: roster, Up next, scorecard, and every
          other tile are cards you can add, size, and drag to reorder. */}
      <DashboardSurface />
    </>
  )
}
