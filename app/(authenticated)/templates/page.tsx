import { PageHeader } from '@/app/components/layout/PageHeader'
import { ComingSoon } from '@/app/components/shared/ComingSoon'

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Agreements, worksheets, note templates, email templates, and reminders."
      />
      <ComingSoon
        title="Templates"
        description="Agreement templates come first, with the other categories shelled out alongside."
      />
    </>
  )
}
