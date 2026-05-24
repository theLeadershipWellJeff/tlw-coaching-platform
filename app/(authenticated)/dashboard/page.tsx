import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { ComingSoon } from '@/app/components/shared/ComingSoon'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const firstName = (session?.user?.name || '').split(' ')[0] || 'there'

  return (
    <>
      <PageHeader
        eyebrow="theLeadershipWell"
        title={`${greeting()}, ${firstName}`}
        subtitle="Your weekly session pipeline and practice pulse land here next."
      />
      <ComingSoon
        title="Your dashboard"
        description="The 7-day session list, up-next session, and practice pulse metrics are the next milestone."
      />
    </>
  )
}
