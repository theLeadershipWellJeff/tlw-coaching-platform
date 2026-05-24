import { PageHeader } from '@/app/components/layout/PageHeader'
import { ComingSoon } from '@/app/components/shared/ComingSoon'

export default function GroupsPage() {
  return (
    <>
      <PageHeader title="Groups" subtitle="Cohorts and group coaching engagements." />
      <ComingSoon title="Groups" description="Group coaching management is planned for a future phase." />
    </>
  )
}
