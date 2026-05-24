import { PageHeader } from '@/app/components/layout/PageHeader'
import { ComingSoon } from '@/app/components/shared/ComingSoon'

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" subtitle="Shared resources, frameworks, and reference material." />
      <ComingSoon title="Library" description="The resource library is planned for a future phase." />
    </>
  )
}
