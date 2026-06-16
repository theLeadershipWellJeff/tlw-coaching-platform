import { PageHeader } from '@/app/components/layout/PageHeader'
import { TemplatesLibrary } from './TemplatesLibrary'

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" subtitle="Your templates — note templates now; coaching agreements and worksheets to come." />
      <TemplatesLibrary />
    </>
  )
}
