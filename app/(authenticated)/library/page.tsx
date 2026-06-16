import { PageHeader } from '@/app/components/layout/PageHeader'
import { LibrarySpace } from './LibrarySpace'

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" subtitle="Templates and PDF resources, organized in folders." />
      <LibrarySpace />
    </>
  )
}
