import { PageHeader } from '@/app/components/layout/PageHeader'
import { LibrarySpace } from './LibrarySpace'

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" subtitle="Templates, the library of great questions, PDF resources, and your coaching agreement." guide="library" />
      <LibrarySpace />
    </>
  )
}
