import { PageHeader } from '@/app/components/layout/PageHeader'
import { ComingSoon } from '@/app/components/shared/ComingSoon'

export default function PracticePage() {
  return (
    <>
      <PageHeader title="Practice" subtitle="Revenue, capacity, and the health of your coaching practice." />
      <ComingSoon
        title="Practice analytics"
        description="Detailed practice metrics live here; headline numbers will also surface on the dashboard."
      />
    </>
  )
}
