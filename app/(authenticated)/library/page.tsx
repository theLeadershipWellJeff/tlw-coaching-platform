import { PageHeader } from '@/app/components/layout/PageHeader'
import { TemplatesLibrary } from './TemplatesLibrary'

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" subtitle="Reusable note templates for your sessions." />
      <TemplatesLibrary />
    </>
  )
}
